import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { warnIfUnshippedLocalesShown } from '@/i18n/unshipped-warning';
import { log } from '@/lib/log';
import { getBoss, type ReminderSendPayload, type SlotChangeSendPayload } from './queue';
import { QUEUES, REMINDER_DISPATCH_CRON } from './queue-names';
import { startJobs, type JobDefinition } from './registry';
import { dispatchReminders, sendReminderJob } from './reminders';
import { dispatchSlotChanges, sendSlotChangeJob } from './slot-changes';
import { runHousekeeping } from './housekeeping';

/**
 * The worker's own jobs. A site adds its own in `src/jobs/extensions/`, never
 * here. A send that fails is retried by pg-boss: twice, at once, with no
 * backoff configured.
 */
const BUILT_IN_JOBS: JobDefinition[] = [
  {
    name: QUEUES.reminderSend,
    run: (data: ReminderSendPayload) => sendReminderJob(data),
    failureMessage: 'reminder send failed',
    logFields: (data: ReminderSendPayload) => ({ commitmentId: data.commitmentId }),
  },
  // Dispatcher: poll every 10 minutes for reminders that have come due.
  {
    name: QUEUES.reminderDispatch,
    schedule: REMINDER_DISPATCH_CRON,
    run: () => dispatchReminders(),
    failureMessage: 'reminder dispatch failed',
  },
  {
    name: QUEUES.slotChangeSend,
    run: (data: SlotChangeSendPayload) => sendSlotChangeJob(data),
    failureMessage: 'slot-change email failed',
    logFields: (data: SlotChangeSendPayload) => ({ commitmentId: data.commitmentId }),
  },
  // Slot changes: every 2 minutes, so an email goes out between 10 and 12
  // minutes after the organizer's last move (SLOT_CHANGE_SETTLE_MINUTES).
  {
    name: QUEUES.slotChangeDispatch,
    schedule: '*/2 * * * *',
    run: () => dispatchSlotChanges(),
    failureMessage: 'slot-change dispatch failed',
  },
  // Housekeeping: hourly. Reads already ignore expired rows, so a missed run
  // costs disk, never correctness.
  {
    name: QUEUES.housekeeping,
    schedule: '17 * * * *',
    run: () => runHousekeeping(),
    failureMessage: 'housekeeping failed',
  },
];

async function main() {
  // The reminder and time-changed emails follow E2E_UNSHIPPED_LOCALES as the
  // web server's pages and confirmations do, so say so here as it does.
  warnIfUnshippedLocalesShown();
  const boss = await getBoss();

  const { queues } = await startJobs(boss, BUILT_IN_JOBS);

  log.info({ queues }, 'signup worker started');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'stopping worker');
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  log.error({ err }, 'worker failed to start');
  process.exit(1);
});
