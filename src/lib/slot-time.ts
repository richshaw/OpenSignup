/**
 * Formatting for `slots.slot_at` in emails.
 *
 * `extractSlotAt()` builds slot_at as `${date}T${time}.000Z` — the organizer's
 * wall-clock date and time pinned to UTC, because a signup carries no timezone
 * of its own. The instant is therefore only meaningful when read back in UTC:
 * formatting it in the server's local zone shifts the displayed day by the host
 * offset, so a worker in UTC-7 would tell a participant their Saturday morning
 * slot is on Friday. `src/app/s/[slug]/slot-format.ts` avoids the same trap on
 * the public page by constructing a local-midnight Date; emails render from the
 * stored instant instead, so they pin the formatter to UTC.
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
 * `Saturday, September 6 at 6:00 PM`.
 *
 * Pass `hasTime` when the caller knows whether the slot carries a time of its
 * own — `slotTimeOfDay()` in src/services/slot-fields.ts answers that from the
 * field definitions. Without it this falls back to reading midnight as
 * date-only, which is right for the common case but wrong for a genuine
 * midnight slot: `extractSlotAt` defaults an absent time to `00:00:00`, so the
 * stored instant alone cannot tell the two apart.
 */
export function formatSlotWhen(
  slotAt: Date | null | undefined,
  opts: { hasTime?: boolean } = {},
): string | null {
  if (!slotAt || Number.isNaN(slotAt.getTime())) return null;
  const date = slotAt.toLocaleDateString('en-US', DATE_PARTS);
  const atMidnight = slotAt.getUTCHours() === 0 && slotAt.getUTCMinutes() === 0;
  const dateOnly = opts.hasTime === undefined ? atMidnight : !opts.hasTime;
  if (dateOnly) return date;
  return `${date} at ${slotAt.toLocaleTimeString('en-US', TIME_PARTS)}`;
}
