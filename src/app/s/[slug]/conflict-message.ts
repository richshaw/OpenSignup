import type { Translator } from '@/i18n/translator';

/**
 * Participant-facing copy for a `conflict` from the sign-up dialog: the same
 * email already holds a place on this slot, signed up from another device or
 * with other details. The server's "you already committed to this slot" is
 * written for API callers, not participants.
 *
 * The error carries the existing commitment's id, but the copy never offers
 * a link to it: anyone who knows an email address could then take over that
 * person's sign-up. The confirmation email is the safe way back to it.
 *
 * Null for any other error.
 */
export function conflictMessage(
  error: { code?: string } | null | undefined,
  t: Translator<'participant.errors'>,
): { message: string; suggestion: string } | null {
  return error?.code === 'conflict'
    ? { message: t('conflict.message'), suggestion: t('conflict.suggestion') }
    : null;
}
