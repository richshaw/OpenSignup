/**
 * Participant-facing copy for a `closed` error on the edit page. There it only
 * ever answers a request for more spots after the page loaded: the organizer
 * closed or archived the signup, closed the slot, or its closing time or the
 * lockout before the slot has come, and the slot takes no more places (see
 * `updateOwnCommitment`). Keeping or lowering the number, changing the name or
 * notes, and cancelling all still work, so the copy says what to keep rather
 * than suggesting the page is shut. The server's messages ("signup is not
 * accepting commitments", "that slot is closed") are written for API callers,
 * not participants.
 *
 * The sign-up dialog's `closed` errors refuse a first place, not more of them,
 * so it does not use this.
 */
export const CLOSED = {
  message: "Sign-ups have closed, so you can't add more spots.",
  suggestion: 'Keep the number you have.',
} as const;

/** `CLOSED` for a `closed` error, null for anything else. */
export function closedMessage(error: { code?: string } | null | undefined): typeof CLOSED | null {
  return error?.code === 'closed' ? CLOSED : null;
}
