// "Spot", the help pages' word for one person's place in a slot. "Sign-up"
// beside "the signup", the page, read as one word spelt two ways.
const CANCELLED_TITLE = 'Your spot was cancelled';

/**
 * What the edit page (`./c/[id]/page.tsx`) shows in place of the form for a
 * sign-up whose status is `cancelled` (see `cancelledCommitmentState`, whose
 * `CancelledSlotState` names the first four). Only `removed` says who
 * cancelled: the participant knows when they cancelled or moved, but not when
 * an organizer took them off, and inviting them to sign up again then would
 * only undo the organizer's choice. `no_show`, the other end state, gets the
 * edit link's not-found page instead.
 */
export const CANCELLED_PAGE = {
  /**
   * Its slot still takes places, so signing up again would work. The only one
   * that suggests it; the next three say why it would be refused.
   */
  open: {
    title: CANCELLED_TITLE,
    body: 'There’s still room if you want to sign up again.',
  },
  /** Every place in its slot is taken. */
  full: {
    title: CANCELLED_TITLE,
    body: 'The slot has filled up since.',
  },
  /** Its slot is closed, or too close to its time, while others may be open. */
  slotClosed: {
    title: CANCELLED_TITLE,
    body: 'The slot has closed.',
  },
  /** The signup takes no more places at all. */
  signupClosed: {
    title: CANCELLED_TITLE,
    body: 'The signup has closed.',
  },
  /** An organizer took them off the slot (`removeCommitment`). */
  removed: {
    title: 'The organizer took you off this slot',
    body: 'If you think this is a mistake, contact the organizer.',
  },
  /** Moved to another slot, where it is still active; the page links to it. */
  moved: {
    title: 'Your spot moved to another slot',
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
