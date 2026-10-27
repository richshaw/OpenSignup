import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getOrganizerSession, requireActor } from '@/auth/session';
import { getDb, type Db } from '@/db/client';
import { activityActor, recordActivityBestEffort } from '@/lib/activity';
import { getEnv, magicComposeEnabled } from '@/lib/env';
import { fail, handle, ok, readJson } from '@/lib/api-response';
import { serviceError, ServiceException } from '@/lib/errors';
import { link, publicSignupUrl } from '@/lib/links';
import { log } from '@/lib/log';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import {
  buildFollowUpMessages,
  buildReplyNowMessages,
  FollowUpSchema,
} from '@/lib/magic-compose/follow-up';
import { defaultLlmClient, type MagicComposeErrorCode } from '@/lib/magic-compose/llm-client';
import type { Actor } from '@/lib/policy';
import {
  asksQuestions,
  buildMessages,
  isQuestionsReply,
  MagicComposeDraftSchema,
} from '@/lib/magic-compose/prompt';
import { fitDraftText } from '@/lib/magic-compose/fit-text';
import { persistDraft } from '@/lib/magic-compose/persist';
import type { FollowUp } from '@/lib/magic-compose/questions';
import { mapMagicComposeError } from './errors';
import { buildDraftPreview } from './preview';
import { recordAnswered, recordAsked, type FollowUpOutcome } from './telemetry';

const PromptBodySchema = z.object({
  prompt: z.string().min(1).max(4000),
  // The answers to a questions reply. Parsed on its own below, so a bad one
  // is reported against `followUp` rather than the prompt.
  followUp: z.unknown().optional(),
});

/**
 * Telemetry for a draft that came back with nothing to show, so "tried the
 * AI, it failed, gave up" can be counted. The code only: never the prompt or
 * the model's words. Best effort, outside any transaction, as it describes no
 * change. A questions reply is an answer, not a failure, so it never gets
 * one; `asked_again` is the model asking again after the answers.
 */
async function recordFailed(
  db: Db,
  actor: Actor,
  workspaceId: string,
  code: MagicComposeErrorCode | 'refusal' | 'not_saved' | 'over_limit' | 'asked_again',
): Promise<void> {
  await recordActivityBestEffort(db, {
    workspaceId,
    actor: activityActor(actor),
    eventType: 'magic_compose.failed',
    payload: { code },
  });
}

/**
 * The least time worth giving a request's one retry (after the model asked
 * again, or asked in a shape the page can't show). With less of the request's
 * budget left, the retry would most likely time out, so the organizer is told
 * straight away instead. Never more than half the budget, so a short
 * LLM_TIMEOUT_MS still leaves room for a retry.
 */
const RETRY_MIN_MS = 15_000;

/** Whether the one retry is worth making, with `left` ms of the budget to go. */
function worthRetrying(left: number, signal: AbortSignal): boolean {
  return !signal.aborted && left >= Math.min(RETRY_MIN_MS, getEnv().LLM_TIMEOUT_MS / 2);
}

/**
 * The model asked again after the answers, even after the firmer retry (or
 * there was no time left for one).
 */
function askedAgain(followUp: FollowUp) {
  return fail(
    serviceError(
      'invalid_input',
      followUp.placeholders
        ? "Couldn't draft this. Try again, or fill it in by hand."
        : "Couldn't draft from these answers. Add a little more, or fill it in by hand.",
      { details: { reason: 'asked_again' } },
    ),
  );
}

export async function POST(req: NextRequest) {
  // A follow-up writes one magic_compose.answered row once it has ended,
  // however it ended (a draft, a refusal, asked_again or an error), so the
  // handler leaves that write here, to run after its response is ready.
  const pending: { answered?: () => Promise<void> } = {};
  const res = await handle(async () => {
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
    // (or answers) don't burn the organizer's hourly quota — quota only counts
    // requests we would actually forward to the upstream LLM.
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
    let followUp: FollowUp | undefined;
    if (parsed.data.followUp !== undefined) {
      const answers = FollowUpSchema.safeParse(parsed.data.followUp);
      if (!answers.success) {
        return fail(
          serviceError('invalid_input', answers.error.issues[0]?.message ?? 'invalid answers', {
            field: 'followUp',
          }),
        );
      }
      followUp = answers.data;
    }

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

    const workspaceId = session.defaultWorkspaceId;
    const outcome: FollowUpOutcome = { retried: false, gaveUp: false };
    if (followUp) {
      pending.answered = () => recordAnswered(db, actor, workspaceId, followUp, outcome);
    }

    const client = defaultLlmClient();
    // One time budget for the whole request: a retry gets what the first call
    // left, so the organizer never waits twice LLM_TIMEOUT_MS.
    const deadline = Date.now() + getEnv().LLM_TIMEOUT_MS;
    let raw = await client.generateDraft(
      followUp ? buildFollowUpMessages(userPrompt, followUp) : buildMessages(userPrompt),
      req.signal,
    );

    // Answers must end in a draft or a refusal, never more questions. A model
    // that asks anyway gets one firmer retry, on the same quota. The log lines
    // say how long the description was, never what the answers were.
    if (followUp && raw.ok && asksQuestions(raw.value)) {
      const left = deadline - Date.now();
      if (!worthRetrying(left, req.signal)) {
        // An organizer who has left isn't told anything, so it isn't a give-up.
        outcome.gaveUp = !req.signal.aborted;
        log.warn(
          { promptLength: userPrompt.length, msLeft: left, aborted: req.signal.aborted },
          'magic-compose asked again after the answers, with no time to retry',
        );
        await recordFailed(
          db,
          actor,
          session.defaultWorkspaceId,
          req.signal.aborted ? 'aborted' : 'asked_again',
        );
        return askedAgain(followUp);
      }
      log.info(
        { promptLength: userPrompt.length },
        'magic-compose asked again after the answers; retrying once',
      );
      outcome.retried = true;
      raw = await client.generateDraft(
        buildFollowUpMessages(userPrompt, followUp, { firmly: true }),
        req.signal,
        { timeoutMs: left },
      );
      if (raw.ok && asksQuestions(raw.value)) {
        outcome.gaveUp = true;
        log.warn({ promptLength: userPrompt.length }, 'magic-compose asked again after the retry');
        await recordFailed(db, actor, session.defaultWorkspaceId, 'asked_again');
        return askedAgain(followUp);
      }
    }

    // A first call's questions must be ones the page can ask. Asked in another
    // shape (neither "what" nor "when", one option for "what"), they get one
    // firmer retry for a draft, on the same quota and budget, and its reply
    // goes the usual way below. With no time for it, the reply fails as any
    // other of the wrong shape does; with the organizer gone, it's recorded as
    // that.
    if (
      !followUp &&
      raw.ok &&
      asksQuestions(raw.value) &&
      !MagicComposeDraftSchema.safeParse(raw.value).success
    ) {
      const left = deadline - Date.now();
      if (worthRetrying(left, req.signal)) {
        log.info(
          { promptLength: userPrompt.length },
          'magic-compose asked questions in a shape the page cannot ask; retrying once',
        );
        raw = await client.generateDraft(buildReplyNowMessages(userPrompt), req.signal, {
          timeoutMs: left,
        });
      } else {
        log.warn(
          { promptLength: userPrompt.length, msLeft: left, aborted: req.signal.aborted },
          'magic-compose asked questions in a shape the page cannot ask, with no time to retry',
        );
        if (req.signal.aborted) {
          await recordFailed(db, actor, session.defaultWorkspaceId, 'aborted');
          return fail(serviceError('internal', 'request cancelled'));
        }
      }
    }

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

    // A title or description over its limit is cut down rather than failing
    // the whole draft: a model asked to keep a long announcement word for word
    // goes over the same way on every retry.
    const fitted = fitDraftText(raw.value);
    const draft = MagicComposeDraftSchema.safeParse(fitted.value);
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
    // the failed row says only that it was a refusal (and a follow-up's
    // answered row is still written, as for any ending). Rate-limit stays
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

    // Questions: the description doesn't say what people sign up for, or says
    // it but gives nothing to make a real slot from, so the model asks
    // instead of drafting. A normal answer, not a failure: no signup, and the
    // log line says which topics and how many options, never the options
    // themselves. Only a first call gets here: a follow-up's questions were
    // dealt with above.
    if (isQuestionsReply(draft.data)) {
      const { questions } = draft.data;
      log.info(
        {
          topics: questions.topics,
          options: questions.whatOptions.length,
          promptLength: userPrompt.length,
        },
        'magic-compose asked questions',
      );
      // Questions nobody saw would count as "asked, then left the questions
      // screen", so a request the organizer has already left records none.
      if (!req.signal.aborted) await recordAsked(db, actor, workspaceId, questions);
      return ok({ questions });
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
        warnings: [...fitted.warnings, ...warnings],
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
  await pending.answered?.();
  return res;
}
