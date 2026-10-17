/**
 * Participant-facing copy for a `conflict` from the sign-up dialog: the same
 * email already holds a place on this slot, signed up from another device or
 * with other details. The server's "you already committed to this slot" is
 * written for API callers, not participants.
 *
 * The error carries the existing commitment's id, but the copy never offers
 * a link to it: anyone who knows an email address could then take over that
 * person's sign-up. The confirmation email is the safe way back to it.
 */
export const ALREADY_SIGNED_UP = {
  message: "You're already signed up for this slot.",
  suggestion: 'Use the link in your confirmation email to change or cancel.',
} as const;

/** `ALREADY_SIGNED_UP` for a `conflict` error, null for anything else. */
export function conflictMessage(
  error: { code?: string } | null | undefined,
): typeof ALREADY_SIGNED_UP | null {
  return error?.code === 'conflict' ? ALREADY_SIGNED_UP : null;
}
