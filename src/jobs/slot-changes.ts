import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { log } from '@/lib/log';
import { SLOT_CHANGE_SETTLE_MINUTES } from '@/lib/reminder-eligibility';
import { sendSlotChanged } from '@/email/send';
import { allOf, notifiableRules, toldDifferentTime } from './notify-rules';
import { getBoss, QUEUES, type SlotChangeSendPayload } from './queue';
import { loadDueRow, recordWorkerEmailSent, workerEmailParts } from './worker-email';

/**
 * Moves older than this are not looked for. An email about a slot that moved
 * more than a week ago, and was never sent because the worker was down all
 * that time, would be news to nobody; the reminder for the new time still
 * says it changed. It also keeps the scan off the whole history of moves.
 */
const LOOKBACK_DAYS = 7;

/** A `slot.rescheduled` row for the slot in the joined query. */
const moveOfThisSlot = sql`m.event_type = 'slot.rescheduled'
  AND m.signup_id = ${commitments.signupId}
  AND (m.payload->>'slotId') = ${slots.id}`;

/**
 * When a commitment's slot-change email is due: the participant could get a
 * reminder (`notifiableRules`: same switches, so reminders off or an
 * unsubscribe means no change email either), the slot has moved and then sat
 * still for `SLOT_CHANGE_SETTLE_MINUTES`, it is still where that move put it,
 * and the time the participant was last told is not where the slot is now. A slot moved and moved back is
 * settled where they were told, and sends nothing.
 *
 * As with reminders, the scan queues jobs with these rules and the send job
 * asks them again of the row as it is then, so an unsubscribe, a reminders
 * switch or another move in between is seen by both the same way.
 */
const slotChangeDueRules = {
  ...notifiableRules,
  'slot not moved': sql`EXISTS (
    SELECT 1 FROM activity m
    WHERE ${moveOfThisSlot}
      AND m.occurred_at > now() - make_interval(days => ${LOOKBACK_DAYS})
  )`,
  'slot still moving': sql`NOT EXISTS (
    SELECT 1 FROM activity m
    WHERE ${moveOfThisSlot}
      AND m.occurred_at > now() - make_interval(mins => ${SLOT_CHANGE_SETTLE_MINUTES})
  )`,
  // A field change re-times slots (`rebuildSlotAt`) without moving them, and
  // records no move. Without this, a slot moved in the last week and then
  // re-timed that way would pass the two rules above, and everyone holding it
  // would hear it had moved. Only a time the organizer moved the slot to is
  // news: the newest move's `to` must be where the slot is now, cut to
  // milliseconds as in `toldDifferentTime`.
  'slot re-timed by a field change': sql`(
    SELECT (m.payload->>'to')::timestamptz FROM activity m
    WHERE ${moveOfThisSlot}
    ORDER BY m.occurred_at DESC
    LIMIT 1
  ) = date_trunc('milliseconds', ${slots.slotAt})`,
  'participant already knows the time': toldDifferentTime,
} satisfies Record<string, SQL>;

const slotChangeDueCondition = allOf(slotChangeDueRules);

/** The commitments whose slot-change email is due now. */
export async function selectDueSlotChanges(db: Db): Promise<{ commitmentId: string }[]> {
  return db
    .select({ commitmentId: commitments.id })
    .from(commitments)
    .innerJoin(participants, eq(participants.id, commitments.participantId))
    .innerJoin(slots, eq(slots.id, commitments.slotId))
    .innerJoin(signups, eq(signups.id, commitments.signupId))
    .where(
      and(
        // Only slots moved lately, found through the event index before any
        // commitment is looked at.
        sql`${slots.id} IN (
          SELECT a.payload->>'slotId' FROM activity a
          WHERE a.event_type = 'slot.rescheduled'
            AND a.occurred_at > now() - make_interval(days => ${LOOKBACK_DAYS})
        )`,
        slotChangeDueCondition,
      ),
    );
}

/** Enqueues one slot-change send job per due commitment. */
export async function dispatchSlotChanges(): Promise<{ enqueued: number }> {
  const rows = await selectDueSlotChanges(getDb());

  if (rows.length === 0) return { enqueued: 0 };
  const boss = await getBoss();
  let enqueued = 0;
  for (const r of rows) {
    const payload: SlotChangeSendPayload = { commitmentId: r.commitmentId };
    // As with reminders, the queue dedupes nothing: a commitment still due at
    // the next scan gets another job. The slot.change_sent row the first send
    // records makes the participant's last-told time the slot's time, which
    // drops the commitment from later scans and stops a second job here.
    const jobId = await boss.send(QUEUES.slotChangeSend, payload);
    if (jobId) enqueued++;
  }
  log.info({ enqueued, scanned: rows.length }, 'slot-change emails enqueued');
  return { enqueued };
}

export async function sendSlotChangeJob(payload: SlotChangeSendPayload): Promise<void> {
  const db = getDb();
  // The scan's rules asked again, and the only send guard: a second job for
  // the same commitment finds the slot.change_sent row the first one recorded
  // and its time the slot's own. A check, not a lock, so it holds while the
  // instance runs one worker, as for reminders.
  const due = await loadDueRow(
    db,
    payload.commitmentId,
    slotChangeDueRules,
    slotChangeDueCondition,
    {
      notFound: 'commitment not found for slot change',
      notDue: 'slot-change email no longer due; skipping',
    },
  );
  if (!due) return;
  const { row, to, slotAt } = due;

  const { props, unsubscribePostUrl } = await workerEmailParts(db, row);
  await sendSlotChanged(to, props, { unsubscribePostUrl });

  await recordWorkerEmailSent(db, row, 'slot.change_sent', slotAt);
}
