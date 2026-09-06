/**
 * Reminder inspector / kicker for local development.
 *
 * The dispatcher runs on a 10-minute cron inside `pnpm worker`, which makes
 * "did my reminder work?" a slow question to answer by hand. This prints the
 * commitments the dispatcher considers due right now, and can enqueue them
 * immediately so a running worker sends them within seconds.
 *
 * Usage:
 *   pnpm reminders:due            # list what is due, send nothing
 *   pnpm reminders:due --dispatch # also enqueue them (needs `pnpm worker`)
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { getDb } from '@/db/client';
import { formatSlotWhen } from '@/lib/slot-time';
import { dispatchReminders, selectDueReminders } from '@/jobs/reminders';

async function main(): Promise<void> {
  const shouldDispatch = process.argv.includes('--dispatch');
  const due = await selectDueReminders(getDb());

  if (due.length === 0) {
    console.log('No reminders are due right now.');
    console.log(
      'A reminder is due when the slot is still ahead and within the signup\'s\n' +
        'reminderLeadHours (default 24), the participant signed up more than an\n' +
        'hour ago and has not opted out, sendReminders is on for the signup, and\n' +
        'no reminder.sent was recorded for the commitment yet.',
    );
  } else {
    console.log(`${due.length} reminder(s) due:\n`);
    for (const r of due) {
      console.log(`  ${r.participantEmail}`);
      console.log(`    ${r.signupTitle} · ${r.slotRef}`);
      console.log(`    ${formatSlotWhen(r.slotAt) ?? 'no date'}  [${r.commitmentId}]`);
    }
    console.log('');
  }

  if (shouldDispatch) {
    const { enqueued } = await dispatchReminders();
    console.log(`Enqueued ${enqueued} job(s) on reminders.send.`);
    console.log('Run `pnpm worker` in another terminal to see them sent.');
  } else if (due.length > 0) {
    console.log('Re-run with --dispatch to enqueue these now.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
