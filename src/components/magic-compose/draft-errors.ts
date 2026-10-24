import { MAGIC_COMPOSE_BUCKET } from '@/lib/magic-compose/limits';

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
  return typeof wait === 'number' && wait > 0 ? Math.ceil(wait / 60) : undefined;
}

/**
 * Words a failed draft request for the organizer. Both rate limits are worded
 * here rather than on the server: `consumeRateLimit` is shared by every
 * endpoint, so its "too many requests" and "wait Ns and retry" stay as they
 * are, and only this screen knows the bucket means "this hour's AI drafts".
 * The provider's own 429 is the route's `llmErrorCode: 'rate_limited'`, and
 * says how long the provider asked for when that's more than a minute.
 */
export function explainDraftFailure(status: number, error: DraftErrorBody | undefined): DraftError {
  if (error?.code === 'rate_limited') {
    if (error.details?.bucket === MAGIC_COMPOSE_BUCKET) {
      return { kind: 'hourly_limit', minutes: minutesToWait(error.details) ?? 60 };
    }
    if (error.details?.llmErrorCode === 'rate_limited') {
      const minutes = minutesToWait(error.details) ?? 1;
      const when = minutes > 1 ? `in ${minutes} minutes` : 'in a minute';
      return { kind: 'message', text: `The AI service is busy. Try again ${when}.` };
    }
  }
  const base = error?.message ?? `AI drafting failed (HTTP ${status}). Try again.`;
  return { kind: 'message', text: error?.suggestion ? `${base} — ${error.suggestion}` : base };
}
