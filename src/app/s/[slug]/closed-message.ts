/**
 * Participant-facing copy for a `closed` error on the edit page. There it only
 * ever answers a request for more spots: the organizer closed or archived the
 * signup, or its closing time passed, after the page loaded, and a signup in
 * that state takes no more places (see `updateOwnCommitment`). Keeping or
 * lowering the number, changing the name or notes, and cancelling all still
 * work, so the copy says what to do rather than suggesting the page is shut.
 * The server's "signup is not accepting commitments" is written for API
 * callers, not participants.
 *
 * The sign-up dialog's `closed` errors (a closed slot, too close to the slot
 * time) mean something else, so it does not use this.
 */
export const CLOSED = {
  message: "This signup has closed, so you can't add more spots.",
  suggestion: 'Keep the number you have, or lower it.',
} as const;

/** `CLOSED` for a `closed` error, null for anything else. */
export function closedMessage(error: { code?: string } | null | undefined): typeof CLOSED | null {
  return error?.code === 'closed' ? CLOSED : null;
}
