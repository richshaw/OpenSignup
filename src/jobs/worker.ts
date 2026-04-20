import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { log } from '@/lib/log';
import { getBoss, QUEUES, type ReminderSendPayload } from './queue';
import { dispatchReminders, sendReminderJob } from './reminders';

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

  // Dispatcher: poll every 10 minutes, scanning the 48h window.
  await boss.schedule(QUEUES.reminderDispatch, '*/10 * * * *');
  await boss.work(QUEUES.reminderDispatch, async () => {
    try {
      await dispatchReminders();
    } catch (err) {
      log.error({ err }, 'reminder dispatch failed');
      throw err;
    }
  });

  log.info('signup worker started · reminderDispatch + reminderSend queues online');

  process.on('SIGTERM', async () => {
    log.info('SIGTERM received, stopping worker');
    await boss.stop({ graceful: true });
    process.exit(0);
  });
}

main().catch((err) => {
  log.error({ err }, 'worker failed to start');
  process.exit(1);
});
