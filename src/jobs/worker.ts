import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { log } from '@/lib/log';
import { getBoss, QUEUES, type ReminderSendPayload, type SlotChangeSendPayload } from './queue';
import { dispatchReminders, sendReminderJob } from './reminders';
import { dispatchSlotChanges, sendSlotChangeJob } from './slot-changes';
import { runHousekeeping } from './housekeeping';

async function main() {
  const boss = await getBoss();

  await boss.work<ReminderSendPayload>(QUEUES.reminderSend, async (jobs) => {
    for (const job of jobs) {
      try {
        await sendReminderJob(job.data);
      } catch (err) {
        log.error({ err, commitmentId: job.data.commitmentId }, 'reminder send failed');
        throw err; // pg-boss retries it: twice, at once, with no backoff configured
      }
    }
  });

  // Dispatcher: poll every 10 minutes for reminders that have come due.
  await boss.schedule(QUEUES.reminderDispatch, '*/10 * * * *');
  await boss.work(QUEUES.reminderDispatch, async () => {
    try {
      await dispatchReminders();
    } catch (err) {
      log.error({ err }, 'reminder dispatch failed');
      throw err;
    }
  });

  await boss.work<SlotChangeSendPayload>(QUEUES.slotChangeSend, async (jobs) => {
    for (const job of jobs) {
      try {
        await sendSlotChangeJob(job.data);
      } catch (err) {
        log.error({ err, commitmentId: job.data.commitmentId }, 'slot-change email failed');
        throw err; // retried as a reminder send is
      }
    }
  });

  // Slot changes: every 2 minutes, so an email goes out between 10 and 12
  // minutes after the organizer's last move (SLOT_CHANGE_SETTLE_MINUTES).
  await boss.schedule(QUEUES.slotChangeDispatch, '*/2 * * * *');
  await boss.work(QUEUES.slotChangeDispatch, async () => {
    try {
      await dispatchSlotChanges();
    } catch (err) {
      log.error({ err }, 'slot-change dispatch failed');
      throw err;
    }
  });

  // Housekeeping: hourly. Reads already ignore expired rows, so a missed run
  // costs disk, never correctness.
  await boss.schedule(QUEUES.housekeeping, '17 * * * *');
  await boss.work(QUEUES.housekeeping, async () => {
    try {
      await runHousekeeping();
    } catch (err) {
      log.error({ err }, 'housekeeping failed');
      throw err;
    }
  });

  log.info('signup worker started · reminder, slot-change and housekeeping queues online');

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
