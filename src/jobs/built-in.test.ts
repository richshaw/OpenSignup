import { describe, expect, it } from 'vitest';
import { BUILT_IN_JOBS } from './built-in';
import { QUEUES, REMINDER_DISPATCH_CRON } from './queue-names';

// The worker's own jobs, as they were registered one by one before the table.
// The health check reads reminders.dispatch completions against
// REMINDER_DISPATCH_CRON, so that schedule mustn't drift.
describe('BUILT_IN_JOBS', () => {
  const byName = new Map(BUILT_IN_JOBS.map((job) => [job.name, job]));

  it('runs every queue the worker creates, once each', () => {
    expect(BUILT_IN_JOBS.map((job) => job.name).sort()).toEqual(Object.values(QUEUES).sort());
  });

  it.each([
    [QUEUES.reminderDispatch, REMINDER_DISPATCH_CRON, 'reminder dispatch failed'],
    [QUEUES.reminderSend, undefined, 'reminder send failed'],
    [QUEUES.slotChangeDispatch, '*/2 * * * *', 'slot-change dispatch failed'],
    [QUEUES.slotChangeSend, undefined, 'slot-change email failed'],
    [QUEUES.housekeeping, '17 * * * *', 'housekeeping failed'],
  ])('%s keeps its schedule and failure message', (name, schedule, failureMessage) => {
    const job = byName.get(name);
    expect(job?.schedule).toBe(schedule);
    expect(job?.failureMessage).toBe(failureMessage);
  });

  it.each([QUEUES.reminderSend, QUEUES.slotChangeSend])(
    "%s names the commitment in a failure's log line",
    (name) => {
      expect(byName.get(name)?.logFields?.({ commitmentId: 'com_1' })).toEqual({
        commitmentId: 'com_1',
      });
    },
  );
});
