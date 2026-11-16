import type { Translator } from '@/i18n/translator';
import { waitMinutes } from '@/lib/format-duration';

/**
 * Participant-facing copy for a `rate_limited` error. The server's "too many
 * requests" and "wait 3412s and retry" are written for API callers; a busy
 * shared network (a school, an office) can reach the per-IP limit, so
 * participants do see it.
 *
 * The wait is in whole minutes, rounded up and never under one, and the
 * message says "minute" or "minutes" itself (a plural in the catalog), so the
 * participant pages don't carry `waitInMinutes`'s `Intl` code. Without a
 * usable `retryAfterSeconds` it still answers in plain words rather than fall
 * back to the server's text.
 */
export function rateLimitMessage(
  error: { code?: string; details?: { retryAfterSeconds?: unknown } } | null | undefined,
  t: Translator<'participant.errors'>,
): { message: string; suggestion: string } | null {
  if (error?.code !== 'rate_limited') return null;
  const seconds = error.details?.retryAfterSeconds;
  return {
    message: t('rateLimit.message'),
    suggestion:
      typeof seconds === 'number' && Number.isFinite(seconds)
        ? t('rateLimit.wait', { minutes: waitMinutes(seconds) })
        : t('rateLimit.waitAWhile'),
  };
}
