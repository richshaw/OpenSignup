import { SAVE_ERROR_MESSAGE } from '@/components/ui/save-notice';
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

/**
 * The words for a failure of the AI provider, by the route's
 * `details.llmErrorCode` and, for an error the provider sent,
 * `details.upstreamStatus`. Undefined for a kind it has no words for
 * (`aborted`: nobody is waiting for the answer).
 */
function providerFailure(
  details: Record<string, unknown>,
  withAnswers: boolean,
): string | undefined {
  const status = typeof details.upstreamStatus === 'number' ? details.upstreamStatus : undefined;
  switch (details.llmErrorCode) {
    // A call with answers comes back to the questions, where there's no prompt to simplify.
    case 'timeout':
      return withAnswers
        ? 'AI drafting timed out. Try again.'
        : 'AI drafting timed out. Try a simpler prompt.';
    case 'upstream':
      if (status === 401 || status === 403) {
        return 'AI provider rejected the API key. An operator needs to check LLM_API_KEY.';
      }
      if (status !== undefined && status >= 500) {
        return `AI provider is unavailable right now (HTTP ${status}). Try again.`;
      }
      return `AI provider returned an error${status !== undefined ? ` (HTTP ${status})` : ''}. Try again.`;
    case 'invalid_json':
      return 'AI provider returned a malformed response. Try again.';
    case 'schema_mismatch':
      return 'AI provider returned an unexpected response shape. Try again.';
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
 * (`SAVE_ERROR_MESSAGE`), and an answer with no code at all, such as a
 * proxy's error page, says which HTTP status came back. Each line reads as
 * the screen read before there were reasons.
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
  { followUp = null }: { followUp?: FollowUp | null } = {},
): DraftError {
  const details = error?.details ?? {};
  if (error?.code === 'rate_limited') {
    if (details.bucket === MAGIC_COMPOSE_BUCKET) {
      return { kind: 'hourly_limit', minutes: minutesToWait(details) ?? 60 };
    }
    if (details.llmErrorCode === 'rate_limited') {
      const minutes = minutesToWait(details) ?? 1;
      const when = minutes > 1 ? `in ${minutes} minutes` : 'in a minute';
      return message(`The AI service is busy. Try again ${when}.`);
    }
  }
  switch (details.reason) {
    case 'refusal':
      if (error?.message) return message(error.message);
      break;
    case 'asked_again':
      if (followUp) {
        return message(
          answeredNothing(followUp)
            ? "Couldn't draft this. Try again, or fill it in by hand."
            : "Couldn't draft from these answers. Add a little more, or fill it in by hand.",
        );
      }
      break;
    case 'draft_invalid':
      return message('AI draft did not match expected shape — try again or adjust your prompt');
  }
  const provider = providerFailure(details, followUp !== null);
  if (provider) return message(provider);
  const code = error?.code;
  if (code !== undefined && Object.hasOwn(SAVE_ERROR_MESSAGE, code)) {
    return message(SAVE_ERROR_MESSAGE[code as ErrorCode]);
  }
  return message(`AI drafting failed (HTTP ${status}). Try again.`);
}
