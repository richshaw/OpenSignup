import type { FieldType } from '@/schemas/slot-fields';

const dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/**
 * Prettify a group key for display in a WysiwygGroup header.
 * - ISO dates (YYYY-MM-DD) -> "THU, MAY 21" (uppercase per the design).
 * - Empty / no-value sentinel -> type/label-aware prompt (see emptyHeaderCopy).
 * - Anything else -> pass through.
 */
export function prettyHeader(
  rawKey: string | null | undefined,
  fieldType: FieldType,
  fieldLabel?: string,
): string {
  if (!rawKey) {
    return emptyHeaderCopy(fieldType, fieldLabel);
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

/**
 * Action-prompt copy for an empty-bucket group header.
 * date/time get a fixed phrase; other types derive from the field label when
 * provided so an "Item" field reads "Set item" rather than the bland fallback.
 */
export function emptyHeaderCopy(fieldType: FieldType, fieldLabel?: string): string {
  if (fieldType === 'date') return 'Set a date';
  if (fieldType === 'time') return 'Set a time';
  const trimmed = fieldLabel?.trim();
  return trimmed ? `Set ${trimmed.toLowerCase()}` : 'Set a value';
}
