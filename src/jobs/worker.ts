import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { log } from '@/lib/log';
import { getBoss, QUEUES, type ReminderSendPayload } from './queue';
import { dispatchReminders, sendReminderJob } from './reminders';
import { runHousekeeping } from './housekeeping';

async function main() {
  const boss = await getBoss();

  await boss.work<ReminderSendPayload>(QUEUES.reminderSend, async (jobs) => {
    for (const job of jobs) {
      try {
        await sendReminderJob(job.data);
      } catch (err) {
        log.error({ err, commitmentId: job.data.commitmentId }, 'reminder send failed');
        throw err; // triggers pg-boss retry with backoff
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

  log.info('signup worker started · reminderDispatch + reminderSend + housekeeping queues online');

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
