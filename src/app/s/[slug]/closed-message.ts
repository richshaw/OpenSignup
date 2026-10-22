/**
 * Participant-facing copy for a `closed` error. The server's messages ("signup
 * is not accepting commitments", "signup has closed", "that slot is closed")
 * are written for API callers, not participants.
 *
 * `'join'` is the sign-up dialog, where it refuses a first place: the
 * organizer closed or archived the signup or closed the slot, or its closing
 * time or the lockout before the slot came, after the page loaded. The page
 * shows what is still open once it reloads.
 *
 * `'change'` is the edit page. There it only ever answers a request for more
 * spots (see `updateOwnCommitment`). Keeping or lowering the number, changing
 * the name or notes, and cancelling all still work, so the copy says what to
 * keep rather than suggesting the page is shut.
 */
export const CLOSED = {
  join: {
    message: 'No one new can sign up for this slot now.',
    suggestion: 'Reload the page to see what’s still open.',
  },
  change: {
    message: "You can't add more spots now.",
    suggestion: 'Keep the number you have.',
  },
} as const;

type ClosedContext = keyof typeof CLOSED;

/** `CLOSED[context]` for a `closed` error, null for anything else. */
export function closedMessage<C extends ClosedContext>(
  error: { code?: string } | null | undefined,
  context: C,
): (typeof CLOSED)[C] | null {
  return error?.code === 'closed' ? CLOSED[context] : null;
}
