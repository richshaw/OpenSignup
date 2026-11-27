import type { Translator } from '@/i18n/translator';
import type { SignupStatus } from '@/schemas/signups';

/**
 * Spots left on one slot: its capacity less the places taken, never fewer
 * than none, and null when it has no limit. A slot is full when this is 0,
 * including one the organizer lowered below its sign-ups. Who counts as
 * having taken a place is the caller's to say.
 */
export function spotsLeft(capacity: number, taken: number): number;
export function spotsLeft(capacity: number | null, taken: number): number | null;
export function spotsLeft(capacity: number | null, taken: number): number | null {
  return capacity === null ? null : Math.max(0, capacity - taken);
}

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
    const left = spotsLeft(slot.capacity, onSlot);
    open = open === null || left === null ? null : open + left;
  }
  return { taken, total, open, allSlotsOpen };
}

/**
 * What happens to the people already signed up once a signup closes, in
 * English, for the help page on closing a signup. The closed banner says it
 * (`organizer.signup.closed.body`), and so does Close signup's question,
 * before it, in the organizer's language.
 */
export const KEEPS_THEIR_SPOT = 'Everyone already signed up keeps their spot.';

/**
 * What Close signup asks before it closes: where the signup stands, then
 * what closing does. It stops sign-ups until the organizer reopens it with
 * Reopen signup, so it says that rather than sounding final. Once someone
 * has signed up, it also says they keep their spot, in the closed banner's
 * own words, since that's what organizers stop to ask.
 */
export function closeSignupQuestion(
  counts: SpotCounts,
  t: Translator<'organizer.signup.close'>,
): string {
  return t('question', { standing: standing(counts, t), kept: counts.taken > 0 ? 'yes' : 'no' });
}

function standing(
  { taken, total, open, allSlotsOpen }: SpotCounts,
  t: Translator<'organizer.signup.close'>,
): string {
  if (taken === 0) return t('standing.nobody');
  if (open === null) return t('standing.taken', { taken });
  if (open === 0) return allSlotsOpen ? t('standing.allTaken') : t('standing.noneOpen');
  if (total === null) return t('standing.open', { open });
  return t('standing.openOf', { open, total });
}

/**
 * How many of a signup's spots are taken, for its header: beside the public
 * link, and in a phone's bar while it's open. "0 of 21 spots taken", or
 * "3 spots taken" when a slot has no limit and there's no total to count
 * against. Once the signup has stopped taking sign-ups it says so first, as
 * "Closed · 3 of 21 spots taken": the count won't change now.
 */
export function spotsTakenLine(
  { taken, total }: SpotCounts,
  status: SignupStatus,
  t: Translator<'organizer.signup.spots'>,
): string {
  const spots =
    total === null || total === 0 ? t('taken', { taken }) : t('takenOf', { taken, total });
  return t('line', { status, spots });
}
