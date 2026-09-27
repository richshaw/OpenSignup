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
