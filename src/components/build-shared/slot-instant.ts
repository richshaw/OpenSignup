import {
  isRealDate,
  isRealTime,
  pairedTimeField,
  type AnchorCandidate,
} from '@/lib/reminder-fields';

/**
 * When a slot happens, as `YYYY-MM-DDTHH:MM` in UTC, by the rule
 * `extractSlotAt` (src/services/slot-fields.ts) builds `slots.slot_at` with:
 * the date field `dateRef` names, the time field paired with it, and 12:00
 * for a slot with no time. Null when the slot has no real date. A string
 * rather than a Date, so the build page can compare two without a timezone,
 * and tell whether a save moved the slot as the server will see it. Here
 * rather than in src/lib/reminder-fields.ts, so only the Build tab loads it.
 */
export function slotInstantOf(
  dateRef: string,
  fields: readonly AnchorCandidate[],
  values: Record<string, string | undefined>,
): string | null {
  const dateField = fields.find((f) => f.fieldType === 'date' && f.ref === dateRef) ?? null;
  const date = dateField ? values[dateField.ref] : undefined;
  if (date === undefined || !isRealDate(date)) return null;
  const timeField = pairedTimeField(dateField, fields);
  const time = timeField ? values[timeField.ref] : undefined;
  return `${date}T${time !== undefined && isRealTime(time) ? time : '12:00'}`;
}
