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
  for (const slot of slots) {
    const onSlot = committedBySlot[slot.id] ?? 0;
    taken += onSlot;
    total = total === null || slot.capacity === null ? null : total + slot.capacity;
    if (slot.status !== 'open') continue;
    open =
      open === null || slot.capacity === null ? null : open + Math.max(0, slot.capacity - onSlot);
  }
  return { taken, total, open };
}

/**
 * What Close signup asks before it closes: where the signup stands, then
 * what closing does. There is no way back from closed, so it says so.
 */
export function closeSignupQuestion(counts: SpotCounts): string {
  return `${standing(counts)} People can’t sign up after this, and you can’t reopen it.`;
}

function standing({ taken, total, open }: SpotCounts): string {
  if (taken === 0) return 'Nobody has signed up yet.';
  if (open === null) return taken === 1 ? '1 spot is taken.' : `${taken} spots are taken.`;
  if (open === 0) {
    return total !== null && taken >= total ? 'Every spot is taken.' : 'No spots are still open.';
  }
  const verb = open === 1 ? 'is' : 'are';
  if (total === null) return `${open} ${open === 1 ? 'spot' : 'spots'} ${verb} still open.`;
  return `${open} of ${total} spots ${verb} still open.`;
}
