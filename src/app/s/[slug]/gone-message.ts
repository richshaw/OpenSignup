import type { Translator } from '@/i18n/translator';

/**
 * Participant-facing copy for a `not_found` from a sign-up, edit or cancel:
 * the organizer deleted the slot, or the whole signup, after the page loaded.
 * The server's "slot not found", "signup not found" and "commitment not
 * found" are written for API callers, not participants.
 *
 * Null for any other error.
 */
export function goneMessage(
  error: { code?: string } | null | undefined,
  t: Translator<'participant.errors'>,
): { message: string; suggestion: string } | null {
  return error?.code === 'not_found'
    ? { message: t('gone.message'), suggestion: t('gone.suggestion') }
    : null;
}

/**
 * The copy for a whole page (`./not-found.tsx`, `./c/[id]/not-found.tsx`),
 * which reads like `goneMessage`'s. Each reads the same whatever the cause,
 * so it never tells a visitor whether a signup, or a sign-up on it, was ever
 * there.
 */
export function gonePage(t: Translator<'participant.gonePage'>) {
  return {
    /** `/s/[slug]`: the signup was deleted, or never existed. */
    signup: { title: t('signup.title'), body: t('signup.body') },
    /**
     * An edit link: the signup or the slot was deleted, or the token is
     * missing or wrong. A mail client that cuts the token off is the likeliest
     * of these, so it can't say the sign-up is gone. Everyone can contact the
     * organizer, but someone who signed up without an email has no
     * confirmation email to go back to, so that step is only for those who
     * got one.
     */
    editLink: { title: t('editLink.title'), body: t('editLink.body') },
  };
}
