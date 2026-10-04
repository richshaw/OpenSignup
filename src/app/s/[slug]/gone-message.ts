/**
 * Participant-facing copy for a `not_found` from a sign-up, edit or cancel:
 * the organizer deleted the slot, or the whole signup, after the page loaded.
 * The server's "slot not found", "signup not found" and "commitment not
 * found" are written for API callers, not participants.
 */
export const GONE = {
  message: 'Sorry, this is no longer available.',
  suggestion: 'Reload the page to see what has changed.',
} as const;

/** `GONE` for a `not_found` error, null for anything else. */
export function goneMessage(error: { code?: string } | null | undefined): typeof GONE | null {
  return error?.code === 'not_found' ? GONE : null;
}

/**
 * `GONE` for a whole page (`./not-found.tsx`, `./c/[id]/not-found.tsx`).
 * Each reads the same whatever the cause, so it never tells a visitor
 * whether a signup, or a sign-up on it, was ever there.
 */
export const GONE_PAGE = {
  /** `/s/[slug]`: the signup was deleted, or never existed. */
  signup: {
    title: 'Sorry, this signup is no longer available',
    body: 'Contact the organizer to find out what has changed, or to ask them for a new link.',
  },
  /**
   * An edit link: the signup or the slot was deleted, or the token is missing
   * or wrong. A mail client that cuts the token off is the likeliest of these,
   * so it can't say the sign-up is gone. Everyone can contact the organizer,
   * but someone who signed up without an email has no confirmation email to
   * go back to, so that step is only for those who got one.
   */
  editLink: {
    title: 'Sorry, this link isn’t working',
    body: 'Your sign-up may no longer be available, or the link may be incomplete. Contact the organizer to find out what has changed. If you got a confirmation email, you can also try its link again.',
  },
} as const;
