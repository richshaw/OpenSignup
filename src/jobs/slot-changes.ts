import { and, inArray, sql, type SQL } from 'drizzle-orm';
import { getDb, type Queryable } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { slots } from '@/db/schema/slots';
import { log } from '@/lib/log';
import { sendSlotChanged } from '@/email/send';
import {
  allOf,
  joinCommitmentTables,
  moveOfThisSlot,
  notifiableRules,
  slotSettled,
  toldDifferentTime,
} from './notify-rules';
import { getBoss, type SlotChangeSendPayload } from './queue';
import { QUEUES } from './queue-names';
import { loadDueRow, recordWorkerEmailSent, workerEmailParts } from './worker-email';

/**
 * Moves older than this are not looked for. An email about a slot that moved
 * more than a week ago, and was never sent because the worker was down all
 * that time, would be news to nobody; the reminder for the new time still
 * says it changed. It also keeps the scan off the whole history of moves.
 */
const LOOKBACK_DAYS = 7;

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
  'slot still moving': slotSettled,
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

/**
 * The commitments whose slot-change email is due now.
 *
 * Two steps on purpose. The slots moved in the lookback window come first, in
 * a query of their own through the event index, and when there are none (the
 * usual case) that is the only statement. Written as one query with
 * `slots.id IN (SELECT …)`, Postgres joined every active commitment on the
 * instance to its slot and ran the field-change rule's subquery on each pair
 * before it narrowed to the moved slots: seconds every 2 minutes on a large
 * instance, however few slots had moved. With the ids in hand, it fetches
 * those slots by primary key and runs the rules on their commitments only.
 */
export async function selectDueSlotChanges(db: Queryable): Promise<{ commitmentId: string }[]> {
  const moved = await db
    .selectDistinct({ slotId: sql<string>`${activity.payload}->>'slotId'` })
    .from(activity)
    .where(
      and(
        sql`${activity.eventType} = 'slot.rescheduled'`,
        sql`${activity.occurredAt} > now() - make_interval(days => ${LOOKBACK_DAYS})`,
      ),
    );
  const slotIds = moved.flatMap((m) => (m.slotId ? [m.slotId] : []));
  if (slotIds.length === 0) return [];

  return joinCommitmentTables(
    db.select({ commitmentId: commitments.id }).from(commitments).$dynamic(),
  ).where(and(inArray(slots.id, slotIds), slotChangeDueCondition));
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
