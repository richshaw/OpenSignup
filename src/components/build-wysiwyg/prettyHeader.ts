import { isRealDate } from '@/lib/reminder-fields';
import { formatSlotDate, formatSlotTime } from '@/lib/slot-label';
import type { FieldType } from '@/schemas/slot-fields';

/**
 * Prettify a group key for display in a WysiwygGroup header.
 * - ISO dates (YYYY-MM-DD) -> "Thu, May 21", as the public page prints them
 *   (the header's CSS uppercases it).
 * - Times (HH:MM) -> "6:30 PM", the 12-hour clock the public page uses.
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
  if (fieldType === 'time') return formatSlotTime(rawKey) ?? rawKey;
  // Only a stored-shape date: `formatSlotDate` parses anything else with
  // `new Date()`, which reads a half-typed "Sat, Nov 14" as a day in 2001.
  if (fieldType === 'date') return (isRealDate(rawKey) && formatSlotDate(rawKey)) || rawKey;
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
