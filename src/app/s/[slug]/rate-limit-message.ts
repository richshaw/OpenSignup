/**
 * Participant-facing copy for a `rate_limited` error. The server's "too many
 * requests" and "wait 3412s and retry" are written for API callers; a busy
 * shared network (a school, an office) can reach the per-IP limit, so
 * participants do see it.
 *
 * The wait is in whole minutes, rounded up and never under one. Without a
 * usable `retryAfterSeconds` it still answers in plain words rather than fall
 * back to the server's text.
 */
export function rateLimitMessage(
  error: { code?: string; details?: { retryAfterSeconds?: unknown } } | null | undefined,
): { message: string; suggestion: string } | null {
  if (error?.code !== 'rate_limited') return null;
  const seconds = error.details?.retryAfterSeconds;
  const minutes =
    typeof seconds === 'number' && Number.isFinite(seconds)
      ? Math.max(1, Math.ceil(seconds / 60))
      : 0;
  return {
    message: 'Too many tries just now.',
    suggestion: minutes
      ? `Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
      : 'Try again in a few minutes.',
  };
}
