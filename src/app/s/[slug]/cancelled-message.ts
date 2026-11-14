import type { Translator } from '@/i18n/translator';

/**
 * What the edit page (`./c/[id]/page.tsx`) shows in place of the form for a
 * sign-up whose status is `cancelled` (see `cancelledCommitmentState`, whose
 * `CancelledSlotState` names the first four), in the language of `t`. Only
 * `removed` says who cancelled: the participant knows when they cancelled or
 * moved, but not when an organizer took them off, and inviting them to sign
 * up again then would only undo the organizer's choice. `no_show`, the other
 * end state, gets the edit link's not-found page instead.
 *
 * The first four share a title. English calls one person's place a "spot",
 * the help pages' word: "sign-up" beside "the signup", the page, read as one
 * word spelt two ways.
 */
export function cancelledPage(t: Translator<'participant.cancelledPage'>) {
  const title = t('title');
  return {
    /**
     * Its slot still takes places, so signing up again would work. The only
     * one that suggests it; the next three say why it would be refused.
     */
    open: { title, body: t('open') },
    /** Every place in its slot is taken. */
    full: { title, body: t('full') },
    /** Its slot is closed, or too close to its time, while others may be open. */
    slotClosed: { title, body: t('slotClosed') },
    /** The signup takes no more places at all. */
    signupClosed: { title, body: t('signupClosed') },
    /** An organizer took them off the slot (`removeCommitment`). */
    removed: { title: t('removed.title'), body: t('removed.body') },
    /** Moved to another slot, where it is still active; the page links to it. */
    moved: { title: t('moved.title'), body: t('moved.body') },
  };
}

/**
 * Whether a save was refused because the sign-up was cancelled after the page
 * loaded, most likely in another tab: a `conflict` whose `details.status` is
 * `cancelled` (see `updateOwnCommitment`). Keyed on the status, not the code
 * alone, since a `conflict` can mean something else. The edit form then
 * reloads the page, which says so (`cancelledPage`).
 */
export function wasCancelled(
  error: { code?: string; details?: Record<string, unknown> } | null | undefined,
): boolean {
  return error?.code === 'conflict' && error.details?.status === 'cancelled';
}
