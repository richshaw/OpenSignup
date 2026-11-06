/**
 * Queue names and the reminder dispatch schedule, in a module with no pg-boss
 * import so the web process (the health check) can read them without loading
 * the job runner.
 */
export const QUEUES = {
  reminderDispatch: 'reminders.dispatch',
  reminderSend: 'reminders.send',
  /** Finds slots that moved and settled, and queues an email per participant. */
  slotChangeDispatch: 'slot-changes.dispatch',
  slotChangeSend: 'slot-changes.send',
  /** Hourly deletion of expired OAuth records and closed rate-limit windows. */
  housekeeping: 'housekeeping.sweep',
} as const;

/** How often the reminder dispatch cron fires. The health check's staleness threshold is a multiple of it. */
export const REMINDER_DISPATCH_EVERY_MINUTES = 10;

export const REMINDER_DISPATCH_CRON = `*/${REMINDER_DISPATCH_EVERY_MINUTES} * * * *`;
