import type { Translator } from '@/i18n/translator';
import { refusalFromQuery } from '@/lib/organizer-errors';

/**
 * What Connected apps says when Disconnect fails, from the code its action
 * put in `?error=`: `internal`, for a failure that wasn't a refusal, has its
 * own line, and any other code the line for that code. Null for anything
 * that isn't a code, so a link can't put words of its own on the page.
 */
export function disconnectRefusal(
  t: Translator<'organizer.errors'>,
  error: string | undefined,
): string | null {
  return error === 'internal' ? t('disconnectFailed') : refusalFromQuery(t, error);
}
