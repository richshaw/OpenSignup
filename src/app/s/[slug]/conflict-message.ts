import type { Translator } from '@/i18n/translator';

/**
 * Participant-facing copy for a `conflict`, and on the edit page a
 * `forbidden`. The server's "you already committed to this slot", "commitment
 * is not active" and "invalid edit token" are written for API callers, not
 * participants.
 *
 * `'join'` is the sign-up dialog, where a `conflict` means the same email
 * already holds a place on this slot, signed up from another device or with
 * other details. The error carries the existing commitment's id, but the copy
 * never offers a link to it: anyone who knows an email address could then take
 * over that person's sign-up. The confirmation email is the safe way back to
 * it.
 *
 * `'change'` is the edit page. There a `conflict` means the sign-up is no
 * longer active (a cancelled one reloads the page instead, see
 * `wasCancelled`), and a `forbidden` that the link no longer opens it; the
 * page loaded with that link, so neither is likely. Either way nothing on the
 * page can change it now, and reloading shows why.
 *
 * Null for any other error.
 */
export function conflictMessage(
  error: { code?: string } | null | undefined,
  context: 'join' | 'change',
  t: Translator<'participant.errors'>,
): { message: string; suggestion: string } | null {
  if (context === 'join') {
    return error?.code === 'conflict'
      ? { message: t('conflict.message'), suggestion: t('conflict.suggestion') }
      : null;
  }
  return error?.code === 'conflict' || error?.code === 'forbidden'
    ? { message: t('conflict.change'), suggestion: t('gone.suggestion') }
    : null;
}
