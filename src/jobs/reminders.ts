import { and, between, eq, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';
import { log } from '@/lib/log';
import { publicSignupUrl } from '@/lib/links';
import { sendReminder } from '@/email/send';
import { getBoss, QUEUES, type ReminderSendPayload } from './queue';

/**
 * Scans for confirmed/tentative commitments whose slots occur in [~47h, ~49h]
 * from now, that have not yet had a reminder recorded in activity, and
 * enqueues one reminders.send job per commitment.
 */
export async function dispatchReminders(): Promise<{ enqueued: number }> {
  const db = getDb();
  const now = Date.now();
  const windowStart = new Date(now + 47 * 3600 * 1000);
  const windowEnd = new Date(now + 49 * 3600 * 1000);

  const rows = await db
    .select({ commitmentId: commitments.id })
    .from(commitments)
    .innerJoin(slots, eq(slots.id, commitments.slotId))
    .innerJoin(signups, eq(signups.id, commitments.signupId))
    .where(
      and(
        or(eq(commitments.status, 'confirmed'), eq(commitments.status, 'tentative')),
        eq(signups.status, 'open'),
        between(slots.slotAt, windowStart, windowEnd),
        sql`COALESCE((${signups.settings}->>'sendReminders')::boolean, true) = true`,
        // skip if a reminder was already recorded for this commitment
        sql`NOT EXISTS (
          SELECT 1 FROM activity a
          WHERE a.event_type = 'reminder.sent'
            AND (a.payload->>'commitmentId') = ${commitments.id}
        )`,
      ),
    );

  if (rows.length === 0) return { enqueued: 0 };
  const boss = await getBoss();
  let enqueued = 0;
  for (const r of rows) {
    const payload: ReminderSendPayload = { commitmentId: r.commitmentId };
    // singletonKey collapses concurrent enqueues per commitment while a job is
    // active or retrying. Once the job completes, the NOT EXISTS reminder.sent
    // check above excludes the commitment on subsequent scans.
    const jobId = await boss.send(QUEUES.reminderSend, payload, {
      singletonKey: r.commitmentId,
    });
    if (jobId) enqueued++;
  }
  log.info({ enqueued, scanned: rows.length }, 'reminders enqueued');
  return { enqueued };
}

export async function sendReminderJob(payload: ReminderSendPayload): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({
      commitment: commitments,
      slot: slots,
      signup: signups,
      participant: participants,
    })
    .from(commitments)
    .innerJoin(slots, eq(slots.id, commitments.slotId))
    .innerJoin(signups, eq(signups.id, commitments.signupId))
    .innerJoin(participants, eq(participants.id, commitments.participantId))
    .where(eq(commitments.id, payload.commitmentId))
    .limit(1);

  if (!row) {
    log.warn({ commitmentId: payload.commitmentId }, 'commitment not found for reminder');
    return;
  }
  if (row.commitment.status !== 'confirmed' && row.commitment.status !== 'tentative') {
    return;
  }

  await sendReminder(row.participant.email, {
    participantName: row.participant.name,
    signupTitle: row.signup.title,
    signupUrl: publicSignupUrl(row.signup.slug),
    slotLabel: row.slot.title,
    slotDateLabel: row.slot.slotAt
      ? row.slot.slotAt.toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        })
      : 'Soon',
    notes: row.commitment.notes,
  });

  await recordActivity(db, {
    signupId: row.signup.id,
    workspaceId: row.signup.workspaceId,
    actor: { actorId: null, actorType: 'system' },
    eventType: 'reminder.sent',
    payload: {
      commitmentId: row.commitment.id,
      participantId: row.participant.id,
      channel: 'email',
    },
  });
}

