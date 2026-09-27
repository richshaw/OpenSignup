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
 * `GONE` for a whole page: `/s/[slug]`, or an edit link under it, whose
 * signup was deleted or never existed (`./not-found.tsx`). It reads the same
 * either way, so the page never tells a visitor a signup was there.
 */
export const GONE_PAGE = {
  title: 'Sorry, this signup is no longer available',
  body: 'Contact the organizer to find out what has changed, or to ask them for a new link.',
} as const;
