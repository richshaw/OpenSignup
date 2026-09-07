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
}

/**
 * Decides whether a settings save turns reminders on or off.
 *
 * A control the POST actually carried wins; one it did not carry leaves what
 * is already saved alone. A stale cached form — one rendered before the
 * control existed — must never silently switch reminders off.
 */
export function resolveSendReminders(
  fields: ReminderFormFields,
  previous: { sendReminders?: boolean | undefined },
): boolean {
  return fields.sendRemindersPresent
    ? fields.sendRemindersChecked
    : (previous.sendReminders ?? true);
}
