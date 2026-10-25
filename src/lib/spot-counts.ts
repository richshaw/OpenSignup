import type { SignupStatus } from '@/schemas/signups';

/** A signup's spots, all slots together. */
export interface SpotCounts {
  /** Spots confirmed and tentative sign-ups hold, as the public page counts them. */
  taken: number;
  /** Every slot's capacity added up, or null when any slot has no limit. */
  total: number | null;
  /**
   * Spots people can still take: each open slot's free spots, never fewer
   * than none, added up. Null when an open slot has no limit.
   */
  open: number | null;
  /**
   * Whether every slot is open. Only then does no open spots mean every spot
   * is taken: a closed slot can still have free ones.
   */
  allSlotsOpen: boolean;
}

/**
 * How many of a signup's spots are taken, of how many, and how many are
 * still open. `committedBySlot` is what `committedBySlot` in the commitments
 * service returns; only the signup's own slots count. A closed slot's free
 * spots aren't open, and an over-full slot doesn't use up another's.
 */
export function spotCounts(
  slots: readonly { id: string; capacity: number | null; status: string }[],
  committedBySlot: Record<string, number>,
): SpotCounts {
  let taken = 0;
  let total: number | null = 0;
  let open: number | null = 0;
  let allSlotsOpen = true;
  for (const slot of slots) {
    const onSlot = committedBySlot[slot.id] ?? 0;
    taken += onSlot;
    total = total === null || slot.capacity === null ? null : total + slot.capacity;
    if (slot.status !== 'open') {
      allSlotsOpen = false;
      continue;
    }
    open =
      open === null || slot.capacity === null ? null : open + Math.max(0, slot.capacity - onSlot);
  }
  return { taken, total, open, allSlotsOpen };
}

/**
 * What happens to the people already signed up once a signup closes. The
 * closed banner says it, and so does Close signup's question, before it.
 */
export const KEEPS_THEIR_SPOT = 'Everyone already signed up keeps their spot.';

/**
 * What Close signup asks before it closes: where the signup stands, then
 * what closing does. There is no way back from closed, so it says so. Once
 * someone has signed up, it also says they keep their spot, in the closed
 * banner's own words, since that's what organizers stop to ask.
 */
export function closeSignupQuestion(counts: SpotCounts): string {
  const question = `${standing(counts)} People can’t sign up after this, and you can’t reopen it.`;
  return counts.taken > 0 ? `${question} ${KEEPS_THEIR_SPOT}` : question;
}

function standing({ taken, total, open, allSlotsOpen }: SpotCounts): string {
  if (taken === 0) return 'Nobody has signed up yet.';
  if (open === null) return taken === 1 ? '1 spot is taken.' : `${taken} spots are taken.`;
  if (open === 0) return allSlotsOpen ? 'Every spot is taken.' : 'No spots are open.';
  const verb = open === 1 ? 'is' : 'are';
  if (total === null) return `${open} ${open === 1 ? 'spot' : 'spots'} ${verb} still open.`;
  return `${open} of ${total} spots ${verb} still open.`;
}

/**
 * How many of a signup's spots are taken, for its header: beside the public
 * link, and in a phone's bar while it's open. "0 of 21 spots taken", or
 * "3 spots taken" when a slot has no limit and there's no total to count
 * against. Once the signup has stopped taking sign-ups it says so first, as
 * "Closed · 3 of 21 spots taken": the count won't change now.
 */
export function spotsTakenLine({ taken, total }: SpotCounts, status: SignupStatus): string {
  const counted =
    total === null || total === 0
      ? `${taken} ${taken === 1 ? 'spot' : 'spots'} taken`
      : `${taken} of ${total} ${total === 1 ? 'spot' : 'spots'} taken`;
  if (status === 'closed') return `Closed · ${counted}`;
  if (status === 'archived') return `Archived · ${counted}`;
  return counted;
}
