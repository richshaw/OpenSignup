/**
 * The one rule deciding whether a commitment will get a reminder, shared by the
 * dispatcher that sends them and the confirmation email that promises them.
 *
 * These two had drifted: the confirmation promised a reminder whenever the
 * signup had reminders on and the slot had a date, while the dispatcher also
 * requires the slot to still be ahead and the commitment to have settled for an
 * hour. Sign up at 09:00 for a 09:40 slot and the receipt promised a reminder
 * that could never arrive. Keeping the threshold and the predicate here means a
 * change to one is a change to both.
 */

/**
 * How long a commitment must exist before its reminder is eligible.
 *
 * Someone who signed up minutes ago does not need a "coming up soon" email on
 * the heels of their confirmation. The dispatcher applies this as
 * `created_at < now() - interval`, so a slot inside this window of the signup
 * never has a scan that can select it.
 */
export const REMINDER_SETTLE_HOURS = 1;

const MS_PER_HOUR = 3_600_000;

/**
 * Whether a reminder will actually be sent for a commitment created now.
 *
 * Deliberately not the dispatcher's full predicate: signup status, opt-outs and
 * `slot_at <= now() + lead` are all either true at commit time or can only
 * change later, and a receipt cannot see the future. This covers what is
 * knowable and wrong to promise — reminders switched off, a slot with no date,
 * and a slot too close to the sign-up for any scan to reach it.
 */
export function willSendReminder(input: {
  sendReminders: boolean;
  slotAt: Date | null | undefined;
  /** Commitment creation time; defaults to now. */
  createdAt?: Date;
}): boolean {
  if (!input.sendReminders) return false;
  const { slotAt } = input;
  if (!slotAt || Number.isNaN(slotAt.getTime())) return false;
  const createdAt = input.createdAt ?? new Date();
  return slotAt.getTime() > createdAt.getTime() + REMINDER_SETTLE_HOURS * MS_PER_HOUR;
}
