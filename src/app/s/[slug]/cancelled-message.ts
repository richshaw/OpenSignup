/**
 * Participant-facing copy for a sign-up that is no longer active: it was
 * cancelled (see `ACTIVE_COMMITMENT_STATUSES`). It doesn't say who cancelled
 * it, so it stays true if someone other than the participant ever can.
 */
export const CANCELLED = {
  message: 'This sign-up was cancelled.',
  suggestion: 'Go back to the signup if you want to sign up again.',
} as const;

/**
 * `CANCELLED` for a `conflict` error, null for anything else. On the edit page
 * a save or cancel only gets a `conflict` when the sign-up stopped being
 * active after the page loaded, most likely cancelled in another tab. The
 * server's "commitment is not active" is written for API callers, not
 * participants.
 */
export function cancelledMessage(
  error: { code?: string } | null | undefined,
): typeof CANCELLED | null {
  return error?.code === 'conflict' ? CANCELLED : null;
}

/** `CANCELLED` for the whole edit page (`./c/[id]/page.tsx`). */
export const CANCELLED_PAGE = {
  title: 'This sign-up was cancelled',
  body: CANCELLED.suggestion,
} as const;
