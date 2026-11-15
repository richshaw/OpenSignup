import type { Translator } from '@/i18n/translator';
import type { ErrorCode } from '@/lib/errors';
import { waitMinutes } from '@/lib/format-duration';
import { MAGIC_COMPOSE_BUCKET } from '@/lib/magic-compose/limits';
import { answeredNothing, type FollowUp } from '@/lib/magic-compose/questions';

/** The `error` of the API's envelope, as far as the drafting screen reads it. */
export interface DraftErrorBody {
  code?: string;
  message?: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

/**
 * What a failed draft tells the organizer. The hourly limit is its own kind
 * because its message carries a link to the manual form.
 */
export type DraftError =
  | { kind: 'message'; text: string }
  | { kind: 'hourly_limit'; minutes: number };

/** Whole minutes in a 429's `retryAfterSeconds`, rounded up, or undefined when it has none. */
function minutesToWait(details: Record<string, unknown> | undefined): number | undefined {
  const wait = details?.retryAfterSeconds;
  return typeof wait === 'number' && wait > 0 ? waitMinutes(wait) : undefined;
}

const message = (text: string): DraftError => ({ kind: 'message', text });

type WordedCode = Exclude<ErrorCode, 'internal'>;

/**
 * The line in `organizer.errors` for each code a failed draft is worded by,
 * all but `internal`. A table, so a code read from the response is looked up
 * only if it's one of its own keys, and a new code fails the type check until
 * it's listed.
 */
const CODE_LINE: { [C in WordedCode]: `code.${C}` } = {
  forbidden: 'code.forbidden',
  unauthorized: 'code.unauthorized',
  conflict: 'code.conflict',
  capacity_full: 'code.capacity_full',
  closed: 'code.closed',
  not_found: 'code.not_found',
  invalid_input: 'code.invalid_input',
  rate_limited: 'code.rate_limited',
  already_consumed: 'code.already_consumed',
};

/**
 * The messages a failed draft is worded with, in the organizer's language:
 * Magic Compose's own (`organizer.compose.errors`), and the line for a
 * refusal's code, which the pages rendered on the server use too
 * (`organizer.errors`).
 */
export type DraftErrorTranslators = {
  compose: Translator<'organizer.compose.errors'>;
  errors: Translator<'organizer.errors'>;
};

/**
 * The words for a failure of the AI provider, by the route's
 * `details.llmErrorCode` and, for an error the provider sent,
 * `details.upstreamStatus`. Undefined for a kind it has no words for
 * (`aborted`: nobody is waiting for the answer).
 */
function providerFailure(
  details: Record<string, unknown>,
  withAnswers: boolean,
  t: DraftErrorTranslators['compose'],
): string | undefined {
  const status = typeof details.upstreamStatus === 'number' ? details.upstreamStatus : undefined;
  switch (details.llmErrorCode) {
    // A call with answers comes back to the questions, where there's no prompt to simplify.
    case 'timeout':
      return withAnswers ? t('timeoutWithAnswers') : t('timeout');
    case 'upstream':
      if (status === 401 || status === 403) return t('apiKey');
      if (status !== undefined && status >= 500) return t('unavailable', { status });
      return status !== undefined ? t('providerErrorStatus', { status }) : t('providerError');
    case 'invalid_json':
      return t('malformed');
    case 'schema_mismatch':
      return t('shape');
    default:
      return undefined;
  }
}

/**
 * Words a failed draft request for the organizer, from its code, its
 * `details.reason` (see `ErrorReason`) and, for the AI provider's failures,
 * its `details.llmErrorCode`. The server's `message` and `suggestion` are
 * English for API callers, so neither is shown, with one exception: a
 * `refusal`'s message is the AI's own explanation of why it declined, not
 * the server's words. Anything else gets the line for its code
 * (`organizer.errors.code`), except an unexpected `internal`, whose line
 * ("Save failed.") names something the organizer didn't ask for. That, and
 * an answer with no code at all, such as a proxy's error page, say which
 * HTTP status came back. The other lines read as the screen read before
 * there were reasons.
 *
 * Both rate limits are worded here: `consumeRateLimit` is shared by every
 * endpoint, and only this screen knows the bucket means "this hour's AI
 * drafts". The provider's own 429 says how long the provider asked for when
 * that's more than a minute. `followUp` is the answers the request carried,
 * if any: whether there were any decides what a timeout says, and whether
 * any were given decides what a draft that asked again says, as on the
 * server.
 */
export function explainDraftFailure(
  status: number,
  error: DraftErrorBody | undefined,
  { compose, errors }: DraftErrorTranslators,
  { followUp = null }: { followUp?: FollowUp | null } = {},
): DraftError {
  const details = error?.details ?? {};
  if (error?.code === 'rate_limited') {
    if (details.bucket === MAGIC_COMPOSE_BUCKET) {
      return { kind: 'hourly_limit', minutes: minutesToWait(details) ?? 60 };
    }
    if (details.llmErrorCode === 'rate_limited') {
      return message(compose('busy', { minutes: minutesToWait(details) ?? 1 }));
    }
  }
  switch (details.reason) {
    case 'refusal':
      if (error?.message) return message(error.message);
      break;
    case 'asked_again':
      if (followUp) {
        return message(
          answeredNothing(followUp) ? compose('askedAgain') : compose('askedAgainWithAnswers'),
        );
      }
      break;
    case 'draft_invalid':
      return message(compose('draftInvalid'));
  }
  const provider = providerFailure(details, followUp !== null, compose);
  if (provider) return message(provider);
  const code = error?.code;
  if (code !== undefined && Object.hasOwn(CODE_LINE, code)) {
    return message(errors(CODE_LINE[code as WordedCode]));
  }
  return message(compose('failed', { status }));
}
