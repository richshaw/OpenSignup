const CANCELLED_TITLE = 'This sign-up was cancelled';

/**
 * What the edit page (`./c/[id]/page.tsx`) shows in place of the form for a
 * sign-up whose status is `cancelled` (see `cancelledCommitmentState`, whose
 * `CancelledSlotState` names the first four). None of it says who cancelled,
 * so it stays true if someone other than the participant ever can. `no_show`,
 * the other end state, gets the edit link's not-found page instead.
 */
export const CANCELLED_PAGE = {
  /**
   * Its slot still takes places, so signing up again would work. The only one
   * that suggests it; the next three say why it would be refused.
   */
  open: {
    title: CANCELLED_TITLE,
    body: 'Go back to the signup if you want to sign up again.',
  },
  /** Every place in its slot is taken. */
  full: {
    title: CANCELLED_TITLE,
    body: 'All its places have been taken since.',
  },
  /** Its slot is closed, or too close to its time, while others may be open. */
  slotClosed: {
    title: CANCELLED_TITLE,
    body: 'This slot is no longer taking sign-ups.',
  },
  /**
   * The signup takes no more places at all. Worded as the live edit page's
   * banner for the same thing.
   */
  signupClosed: {
    title: CANCELLED_TITLE,
    body: 'Sign-ups have closed.',
  },
  /** Moved to another slot, where it is still active; the page links to it. */
  moved: {
    title: 'This sign-up moved to another slot',
    body: 'You’re still signed up. Use the link below to see or change it.',
  },
} as const;

/**
 * Whether a save was refused because the sign-up was cancelled after the page
 * loaded, most likely in another tab: a `conflict` whose `details.status` is
 * `cancelled` (see `updateOwnCommitment`). Keyed on the status, not the code
 * alone, since a `conflict` can mean something else. The edit form then
 * reloads the page, which says so (`CANCELLED_PAGE`).
 */
export function wasCancelled(
  error: { code?: string; details?: Record<string, unknown> } | null | undefined,
): boolean {
  return error?.code === 'conflict' && error.details?.status === 'cancelled';
}
