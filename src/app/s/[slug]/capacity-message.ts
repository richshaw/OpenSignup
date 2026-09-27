/**
 * Participant-facing copy for a `capacity_full` error.
 *
 * The service's own message and suggestion ("only 1 left ...", "lower the
 * quantity to 1 or fewer") are terse developer strings that the REST API
 * returns to any caller, so they stay as they are and the participant pages
 * rephrase them here from the numbers in `details`.
 *
 * The copy never names the input it refers to, so it survives the field's
 * label changing.
 */

/**
 * `'join'` is the sign-up dialog, `'change'` the edit page. `remaining` means
 * different things on the two: on join it is the spots still free, on change
 * it is the most this commitment can hold (capacity minus everyone else's
 * spots), which already counts the ones the participant has. Reading it as
 * "left" on the edit page told someone holding a slot's only spot that just 1
 * was left, when that 1 was theirs.
 */
export type CapacityContext = 'join' | 'change';

export interface CapacityCopy {
  message: string;
  /** Left out when there is nothing useful to suggest. */
  suggestion?: string;
}

interface ApiErrorLike {
  code?: string;
  details?: { remaining?: unknown; requested?: unknown; alternatives?: unknown };
}

function spots(n: number): string {
  return n === 1 ? '1 spot' : `${n} spots`;
}

/**
 * Returns null for any other error, or a `capacity_full` without the numbers,
 * so callers fall back to the server's text rather than guess.
 */
export function capacityMessage(
  error: ApiErrorLike | null | undefined,
  context: CapacityContext,
): CapacityCopy | null {
  if (error?.code !== 'capacity_full') return null;
  const remaining = error.details?.remaining;
  const requested = error.details?.requested;
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return null;
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return null;

  if (context === 'join') {
    if (remaining <= 0) {
      // Only point at other slots when the server found some; with none open,
      // "Pick another slot." would send the participant looking for nothing.
      const alternatives = error.details?.alternatives;
      return Array.isArray(alternatives) && alternatives.length > 0
        ? { message: 'Sorry, this slot just filled up.', suggestion: 'Pick another slot.' }
        : { message: 'Sorry, this slot just filled up.' };
    }
    const verb = remaining === 1 ? 'is' : 'are';
    return {
      message: `Only ${spots(remaining)} ${verb} left, and you asked for ${requested}.`,
      suggestion: remaining === 1 ? 'Ask for 1 instead.' : `Ask for ${remaining} or fewer.`,
    };
  }

  // Defensive only: the server clamps `remaining` at 0, and since capacity
  // can't drop below what is taken, it always covers the participant's own
  // spots, so it should never get this low.
  if (remaining <= 0) {
    return {
      message: "This slot is full, so you can't add more spots.",
      suggestion: 'Keep the number you have.',
    };
  }
  return {
    message: `You can have at most ${spots(remaining)} on this slot, and you asked for ${requested}.`,
    // At 1 the participant already holds that one spot, so there is nothing
    // to ask for instead.
    suggestion: remaining === 1 ? 'Keep your 1 spot.' : `Ask for ${remaining} or fewer.`,
  };
}
