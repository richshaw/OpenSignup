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
  return REMINDER_LEAD_HOUR_CHOICES.includes(
    hours as (typeof REMINDER_LEAD_HOUR_CHOICES)[number],
  );
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
    submittedLead !== null && isOfferedLead(submittedLead)
      ? submittedLead
      : (previous.reminderLeadHours ?? DEFAULT_REMINDER_LEAD_HOURS);

  return { sendReminders, reminderLeadHours };
}
