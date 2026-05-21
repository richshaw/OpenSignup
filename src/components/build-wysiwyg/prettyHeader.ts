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

  const iso = rawKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    const yi = Number(y);
    const mi = Number(m);
    const di = Number(d);
    const dt = new Date(yi, mi - 1, di);
    // `new Date(...)` silently normalizes invalid dates (e.g. Feb 31 rolls
    // forward into March). Round-trip the components so an invalid input
    // falls through to the raw key rather than rendering a misleading date.
    if (
      !Number.isNaN(dt.getTime()) &&
      dt.getFullYear() === yi &&
      dt.getMonth() === mi - 1 &&
      dt.getDate() === di
    ) {
      return dateFmt.format(dt).toUpperCase();
    }
  }
  return rawKey;
}
