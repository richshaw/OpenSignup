import type { FieldType } from '@/schemas/slot-fields';

const dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/**
 * Prettify a group key for display in a WysiwygGroup header.
 * - ISO dates (YYYY-MM-DD) -> "THU, MAY 21" (uppercase per the design).
 * - Empty / no-value sentinel -> "Set a date" (date) or "Set a value" (other).
 * - Anything else -> pass through.
 */
export function prettyHeader(rawKey: string | null | undefined, fieldType: FieldType): string {
  if (!rawKey) {
    return fieldType === 'date' ? 'Set a date' : 'Set a value';
  }
  if (fieldType !== 'date') return rawKey;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawKey);
  if (iso) {
    const [, y, m, d] = iso;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(dt.getTime())) return dateFmt.format(dt).toUpperCase();
  }
  return rawKey;
}
