/**
 * What Magic Compose changed in the AI's draft to make it a signup, as codes
 * with arguments, so the screen can word each one in the organizer's language
 * (`organizer.aiDraft.warnings`). The route also words them in English for
 * API callers (`warningSentence`). No imports, so the browser can read a
 * stored warning without pulling the server's modules in.
 */
export type DraftWarning =
  /** Values that didn't fit their field, left blank. */
  | { code: 'values_blanked'; count: number }
  /** List fields with no usable choices, switched to free text, by ref. */
  | { code: 'enum_fields_to_text'; fields: string[] }
  /** Fields the AI added twice; the later ones were dropped. */
  | { code: 'duplicate_fields'; count: number }
  /** Slot values under a ref no field has, dropped. */
  | { code: 'stray_values'; count: number }
  /** The title or description, over its limit of `max` characters, cut down. */
  | { code: 'text_cut'; field: 'title' | 'description'; max: number };

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/**
 * Whether `value` is a warning this code knows how to word. Read back from
 * the browser's storage, where a tab opened before warnings had codes keeps
 * English sentences, and a newer server's code may not be known yet: those
 * aren't warnings to it, so they're left out rather than shown wrong.
 */
export function isDraftWarning(value: unknown): value is DraftWarning {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  switch (w.code) {
    case 'values_blanked':
    case 'duplicate_fields':
    case 'stray_values':
      return isCount(w.count);
    case 'enum_fields_to_text':
      return (
        Array.isArray(w.fields) &&
        w.fields.length > 0 &&
        w.fields.every((field) => typeof field === 'string')
      );
    case 'text_cut':
      return (w.field === 'title' || w.field === 'description') && isCount(w.max);
    default:
      return false;
  }
}

const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);

/**
 * A warning as the API has always worded it, in English, for callers other
 * than the organizer's screen. The screen words the code from the catalog.
 */
export function warningSentence(warning: DraftWarning): string {
  switch (warning.code) {
    case 'values_blanked':
      return warning.count === 1
        ? "1 value was left blank because it didn't fit its field. Fill it in below."
        : `${warning.count} values were left blank because they didn't fit their fields. Fill them in below.`;
    case 'enum_fields_to_text': {
      const n = warning.fields.length;
      return `${plural(n, 'Field', 'Fields')} ${warning.fields.join(', ')} arrived without a fixed list of options, so ${plural(n, 'it was', 'they were')} switched to free text.`;
    }
    case 'duplicate_fields':
      return `Removed ${warning.count} duplicate ${plural(warning.count, 'field', 'fields')} the AI tried to add twice.`;
    case 'stray_values':
      return `Ignored ${warning.count} stray ${plural(warning.count, 'value', 'values')} that didn't match any field.`;
    case 'text_cut':
      return `The AI's ${warning.field} was longer than ${new Intl.NumberFormat('en').format(warning.max)} characters, so the end was cut off. Check it below.`;
  }
}
