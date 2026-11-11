/**
 * Whether a slot has no value for a field: nothing there, null, or a string
 * that is empty once trimmed. The one rule for "blank" that saving, display,
 * grouping and Publish's check all use, so a value of only spaces can't read
 * as filled in to one of them and empty to another.
 *
 * A module of its own, with no imports, so the Magic Compose preview can use
 * it without pulling the date and time formatting into its page.
 */
export function isBlankSlotValue(raw: unknown): boolean {
  return raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
}
