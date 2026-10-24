import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getOrganizerSession, requireActor } from '@/auth/session';
import { getDb, type Db } from '@/db/client';
import { activityActor, recordActivityBestEffort } from '@/lib/activity';
import { magicComposeEnabled } from '@/lib/env';
import { fail, handle, ok, readJson } from '@/lib/api-response';
import { serviceError, ServiceException } from '@/lib/errors';
import { link, publicSignupUrl } from '@/lib/links';
import { log } from '@/lib/log';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { defaultLlmClient, type MagicComposeErrorCode } from '@/lib/magic-compose/llm-client';
import type { Actor } from '@/lib/policy';
import { buildMessages, MagicComposeDraftSchema } from '@/lib/magic-compose/prompt';
import { persistDraft } from '@/lib/magic-compose/persist';
import { mapMagicComposeError } from './errors';
import { buildDraftPreview } from './preview';

const PromptBodySchema = z.object({
  prompt: z.string().min(1).max(4000),
});

/**
 * Telemetry for a draft that came back with nothing to show, so "tried the
 * AI, it failed, gave up" can be counted. The code only: never the prompt or
 * the model's words. Best effort, outside any transaction, as it describes no
 * change.
 */
async function recordFailed(
  db: Db,
  actor: Actor,
  workspaceId: string,
  code: MagicComposeErrorCode | 'refusal' | 'not_saved' | 'over_limit',
): Promise<void> {
  await recordActivityBestEffort(db, {
    workspaceId,
    actor: activityActor(actor),
    eventType: 'magic_compose.failed',
    payload: { code },
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!magicComposeEnabled()) {
      return fail(
        serviceError('forbidden', 'Magic Compose is not enabled on this instance', {
          suggestion: 'set LLM_BASE_URL and LLM_MODEL to enable',
        }),
      );
    }

    const actor = await requireActor();
    if (actor.kind !== 'organizer') {
      return fail(serviceError('unauthorized', 'sign in to draft a signup'));
    }
    const session = await getOrganizerSession();
    if (!session?.defaultWorkspaceId) {
      return fail(
        serviceError('invalid_input', 'no default workspace for this organizer', {
          field: 'workspaceId',
        }),
      );
    }

    const db = getDb();

    // Parse & validate before consuming rate-limit so malformed/empty bodies
    // don't burn the organizer's 10/hr quota — quota only counts requests we
    // would actually forward to the upstream LLM.
    const body = await readJson(req);
    const parsed = PromptBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        serviceError('invalid_input', parsed.error.issues[0]?.message ?? 'invalid prompt', {
          field: 'prompt',
        }),
      );
    }
    const userPrompt = parsed.data.prompt;

    try {
      await consumeRateLimit(db, RateLimits.magicComposePerOrganizer, actor.id);
    } catch (e) {
      // The organizer used up this instance's quota: as much a failed draft to
      // them as the provider's own limit, so it's counted, then answered 429.
      if (e instanceof ServiceException && e.serviceError.code === 'rate_limited') {
        await recordFailed(db, actor, session.defaultWorkspaceId, 'over_limit');
      }
      throw e;
    }

    const client = defaultLlmClient();
    const raw = await client.generateDraft(buildMessages(userPrompt), req.signal);
    if (!raw.ok) {
      log.warn({ llmError: raw.error }, 'magic-compose generation failed');
      await recordFailed(db, actor, session.defaultWorkspaceId, raw.error.code);
      const mapped = mapMagicComposeError(raw.error);
      const details: Record<string, unknown> = {
        llmErrorCode: raw.error.code,
        ...(mapped.details ?? {}),
      };
      if (raw.error.status !== undefined) details.upstreamStatus = raw.error.status;
      // Intentionally NOT shipping raw.error.upstreamBody to the client — it
      // can contain provider stack traces, internal hostnames, and account
      // identifiers that bypass pino's redaction. Server log.warn above keeps
      // the body for operators.
      return fail(serviceError(mapped.code, mapped.message, { details }));
    }

    const draft = MagicComposeDraftSchema.safeParse(raw.value);
    if (!draft.success) {
      log.warn({ issues: draft.error.issues.slice(0, 5), raw: raw.value }, 'magic-compose draft failed Zod');
      await recordFailed(db, actor, session.defaultWorkspaceId, 'schema_mismatch');
      // Drop `received` and `path` from issues before returning to the client.
      // `received` echoes the raw LLM output back into the response envelope,
      // bypassing pino redaction and potentially leaking provider-generated
      // text into client logs. Code+message is enough for the user.
      const safeIssues = draft.error.issues
        .slice(0, 5)
        .map((i) => ({ code: i.code, message: i.message }));
      return fail(
        serviceError('internal', 'AI draft did not match expected shape', {
          suggestion: 'try again or adjust your prompt',
          details: { issues: safeIssues },
        }),
      );
    }

    // Structured refusal: model returned only `refusalReason`. Surface the
    // reason to the user without creating a signup or burning further work;
    // the activity row says only that it was a refusal. Rate-limit stays
    // consumed (the LLM call did happen).
    if ('refusalReason' in draft.data) {
      log.info(
        { refusalReason: draft.data.refusalReason, promptLength: userPrompt.length },
        'magic-compose refusal returned by model',
      );
      await recordFailed(db, actor, session.defaultWorkspaceId, 'refusal');
      return fail(
        serviceError('invalid_input', draft.data.refusalReason, {
          details: { reason: 'refusal' },
        }),
      );
    }

    // Client closed the connection between the LLM call and persistence —
    // skip the write so we don't strand a signup the user never sees. This
    // narrows but does not eliminate the race (no AbortSignal threading into
    // createSignup yet); the body we return here is discarded by the client.
    if (req.signal.aborted) {
      log.info(
        { promptLength: userPrompt.length },
        'magic-compose request aborted before persistence',
      );
      await recordFailed(db, actor, session.defaultWorkspaceId, 'aborted');
      return fail(serviceError('internal', 'request cancelled'));
    }

    const persisted = await persistDraft(db, actor, session.defaultWorkspaceId, draft.data, {
      logContext: { promptLength: userPrompt.length },
    });
    if (!persisted.ok) {
      await recordFailed(db, actor, session.defaultWorkspaceId, 'not_saved');
      return fail(persisted.error);
    }
    const { signup: created, template, groupByFieldRefs, warnings } = persisted.value;

    return ok(
      {
        id: created.id,
        slug: created.slug,
        summary: {
          fieldsAdded: template.fields.length,
          slotsAdded: template.slots.length,
          promptLength: userPrompt.length,
          groupByFieldRefs,
        },
        warnings,
        draft: buildDraftPreview(draft.data, template),
      },
      {
        links: {
          build: link(`/app/signups/${created.id}/build`),
          self: link(`/api/signups/${created.id}`),
          public: link(publicSignupUrl(created.slug)),
        },
      },
    );
  });
}
