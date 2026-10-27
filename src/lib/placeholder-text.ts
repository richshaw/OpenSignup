/**
 * Placeholder text a slot can still hold: TBD, TBC or TBA as a word, in any
 * case. The Build tab marks a draft's slots that hold it (`placeholderMark`).
 */

// Not inside another word, in any script: "ÉTBA" and "TBD1" are not placeholders.
const PLACEHOLDER = /(?<![\p{L}\p{N}_])(TBD|TBC|TBA)(?![\p{L}\p{N}_])/iu;

/** The placeholder word in `value`, in capitals, or null. */
export function placeholderIn(value: unknown): string | null {
  const match = typeof value === 'string' ? PLACEHOLDER.exec(value) : null;
  return match ? match[1]!.toUpperCase() : null;
}
