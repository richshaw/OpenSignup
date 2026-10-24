/** A signup's spots, all slots together. */
export interface SpotCounts {
  /** Spots confirmed and tentative sign-ups hold, as the public page counts them. */
  taken: number;
  /** Every slot's capacity added up, or null when any slot has no limit. */
  total: number | null;
}

/**
 * How many of a signup's spots are taken, and of how many. `committedBySlot`
 * is what `committedBySlot` in the commitments service returns; only the
 * signup's own slots count.
 */
export function spotCounts(
  slots: readonly { id: string; capacity: number | null }[],
  committedBySlot: Record<string, number>,
): SpotCounts {
  let taken = 0;
  let total: number | null = 0;
  for (const slot of slots) {
    taken += committedBySlot[slot.id] ?? 0;
    total = total === null || slot.capacity === null ? null : total + slot.capacity;
  }
  return { taken, total };
}

/**
 * What Close signup asks before it closes: where the signup stands, then
 * what closing does. There is no way back from closed, so it says so.
 */
export function closeSignupQuestion({ taken, total }: SpotCounts): string {
  return `${standing(taken, total)} People can’t sign up after this, and you can’t reopen it.`;
}

function standing(taken: number, total: number | null): string {
  if (taken === 0) return 'Nobody has signed up yet.';
  if (total === null) return taken === 1 ? '1 spot is taken.' : `${taken} spots are taken.`;
  const open = total - taken;
  if (open <= 0) return 'Every spot is taken.';
  return `${open} of ${total} spots ${open === 1 ? 'is' : 'are'} still open.`;
}
