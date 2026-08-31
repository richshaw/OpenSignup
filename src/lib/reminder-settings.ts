import {
  DEFAULT_REMINDER_LEAD_HOURS,
  REMINDER_LEAD_HOUR_CHOICES,
  type SignupSettings,
} from '@/schemas/signups';

export interface ReminderFormFields {
  /**
   * Whether the POST carried the reminders form at all, from a hidden marker
   * that always submits. An unchecked checkbox sends nothing, so without this
   * "the organizer unticked it" and "this form didn't include the control"
   * look identical.
   */
  sendRemindersPresent: boolean;
  /** Whether the checkbox itself was submitted (i.e. ticked). */
  sendRemindersChecked: boolean;
  /** Raw value of the lead-time select, or null when the field was absent. */
  leadHoursRaw: string | null;
}

export interface ResolvedReminderSettings {
  sendReminders: boolean;
  reminderLeadHours: number;
}

function isOfferedLead(hours: number): boolean {
  return REMINDER_LEAD_HOUR_CHOICES.includes(hours as (typeof REMINDER_LEAD_HOUR_CHOICES)[number]);
}

/**
 * Decides the reminder settings a save should write.
 *
 * The rule for every field is the same: a field the POST actually carried wins,
 * and a field it did not carry leaves what is already saved alone. A stale
 * cached form — one rendered before a control existed — must never silently
 * turn reminders off or downgrade a chosen lead time.
 */
export function resolveReminderSettings(
  fields: ReminderFormFields,
  previous: Partial<Pick<SignupSettings, 'sendReminders' | 'reminderLeadHours'>>,
): ResolvedReminderSettings {
  const sendReminders = fields.sendRemindersPresent
    ? fields.sendRemindersChecked
    : (previous.sendReminders ?? true);

  const submittedLead = fields.leadHoursRaw === null ? null : Number(fields.leadHoursRaw);
  const reminderLeadHours =
    submittedLead !== null &&
    (isOfferedLead(submittedLead) || submittedLead === previous.reminderLeadHours)
      ? submittedLead
      : (previous.reminderLeadHours ?? DEFAULT_REMINDER_LEAD_HOURS);

  return { sendReminders, reminderLeadHours };
}

/**
 * The lead times to offer, given what is currently saved.
 *
 * The saved value is always included even when it is not one of the standard
 * choices. `PATCH /api/signups/[id]` accepts the schema's full 1–168 range, so
 * a value like 12 can legitimately be stored; without it in the list no option
 * matches, the browser preselects the first one, and the next Save silently
 * rewrites 12h to 2h with nothing shown to the organizer.
 */
export function leadHourOptions(saved: number): number[] {
  return [...new Set<number>([...REMINDER_LEAD_HOUR_CHOICES, saved])].sort((a, b) => a - b);
}

/** Human label for a lead time, e.g. `2 days before`, `12 hours before`. */
export function leadHourLabel(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 day before' : `${days} days before`;
  }
  return hours === 1 ? '1 hour before' : `${hours} hours before`;
}
