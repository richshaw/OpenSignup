/**
 * Formatting for `slots.slot_at` in emails.
 *
 * `extractSlotAt()` builds slot_at as `${date}T${time}.000Z` — the organizer's
 * wall-clock date and time pinned to UTC, because a signup carries no timezone
 * of its own — and anchors a date-only slot at `12:00:00Z`, so its day-before
 * reminder lands on the day before in every timezone. The instant is therefore
 * only meaningful when read back in UTC: formatting it in the server's local
 * zone shifts the displayed day by the host offset, so a worker in UTC-7 would
 * tell a participant their Saturday morning slot is on Friday.
 * `src/app/s/[slug]/slot-format.ts` avoids the same trap on the public page by
 * constructing a local-midnight Date; emails render from the stored instant
 * instead, so they pin the formatter to UTC.
 */

const DATE_PARTS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
};

const TIME_PARTS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
};

/**
 * Renders a slot instant as the organizer typed it, e.g.
 * `Saturday, September 6 at 6:00 PM`, or the date alone when the slot has no
 * time of its own.
 *
 * `hasTime` is required because the instant cannot answer it: a date-only slot
 * is stored at noon UTC, byte-for-byte what a genuine `12:00` slot produces.
 * `slotTimeOfDay()` in src/services/slot-fields.ts answers it from the field
 * definitions and the slot's values.
 */
export function formatSlotWhen(
  slotAt: Date | null | undefined,
  opts: { hasTime: boolean },
): string | null {
  if (!slotAt || Number.isNaN(slotAt.getTime())) return null;
  const date = slotAt.toLocaleDateString('en-US', DATE_PARTS);
  if (!opts.hasTime) return date;
  return `${date} at ${slotAt.toLocaleTimeString('en-US', TIME_PARTS)}`;
}
