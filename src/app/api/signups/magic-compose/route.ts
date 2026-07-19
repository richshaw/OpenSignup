import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getOrganizerSession, requireActor } from '@/auth/session';
import { getDb } from '@/db/client';
import { magicComposeEnabled } from '@/lib/env';
import { fail, handle, ok } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { link, publicSignupUrl } from '@/lib/links';
import { log } from '@/lib/log';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { defaultLlmClient } from '@/lib/magic-compose/llm-client';
import { buildMessages, MagicComposeDraftSchema } from '@/lib/magic-compose/prompt';
import {
  buildWarnings,
  hasDropped,
  magicComposeToTemplate,
} from '@/lib/magic-compose/to-template';
import { createSignup } from '@/services/signups';
import { mapMagicComposeError } from './errors';
import { buildDraftPreview } from './preview';

const PromptBodySchema = z.object({
  prompt: z.string().min(1).max(4000),
});

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
    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = PromptBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        serviceError('invalid_input', parsed.error.issues[0]?.message ?? 'invalid prompt', {
          field: 'prompt',
        }),
      );
    }
    const userPrompt = parsed.data.prompt;

    await consumeRateLimit(db, RateLimits.magicComposePerOrganizer, actor.id);

    const client = defaultLlmClient();
    const raw = await client.generateDraft(buildMessages(userPrompt), req.signal);
    if (!raw.ok) {
      log.warn({ llmError: raw.error }, 'magic-compose generation failed');
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
      // `Retry-After` (when the error is rate_limited with retryAfterSeconds in
      // details) is added centrally by fail().
      return fail(serviceError(mapped.code, mapped.message, { details }));
    }

    const draft = MagicComposeDraftSchema.safeParse(raw.value);
    if (!draft.success) {
      log.warn({ issues: draft.error.issues.slice(0, 5), raw: raw.value }, 'magic-compose draft failed Zod');
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
    // reason to the user without creating a signup, writing activity, or
    // burning further work. Rate-limit stays consumed (the LLM call did happen).
    if ('refusalReason' in draft.data) {
      log.info(
        { refusalReason: draft.data.refusalReason, promptLength: userPrompt.length },
        'magic-compose refusal returned by model',
      );
      return fail(
        serviceError('invalid_input', draft.data.refusalReason, {
          details: { reason: 'refusal' },
        }),
      );
    }

    const conversion = magicComposeToTemplate(draft.data);
    const { template, groupByFieldRefs, dropped } = conversion;
    if (hasDropped(dropped)) {
      log.warn(
        { dropped, promptLength: userPrompt.length },
        'magic-compose adjusted or dropped values during conversion',
      );
    }
    const warnings = buildWarnings(dropped);

    // Client closed the connection between the LLM call and persistence —
    // skip the write so we don't strand a signup the user never sees. This
    // narrows but does not eliminate the race (no AbortSignal threading into
    // createSignup yet); the body we return here is discarded by the client.
    if (req.signal.aborted) {
      log.info(
        { promptLength: userPrompt.length },
        'magic-compose request aborted before persistence',
      );
      return fail(serviceError('internal', 'request cancelled'));
    }

    const created = await createSignup(
      db,
      actor,
      session.defaultWorkspaceId,
      {
        title: draft.data.title,
        description: draft.data.description,
        visibility: 'unlisted',
        settings: groupByFieldRefs.length > 0 ? { groupByFieldRefs } : {},
      },
      { template },
    );
    if (!created.ok) return fail(created.error);

    return ok(
      {
        id: created.value.id,
        slug: created.value.slug,
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
          build: link(`/app/signups/${created.value.id}/build`),
          self: link(`/api/signups/${created.value.id}`),
          public: link(publicSignupUrl(created.value.slug)),
        },
      },
    );
  });
}
