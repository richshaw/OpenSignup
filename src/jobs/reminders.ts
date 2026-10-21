import { and, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';
import { log } from '@/lib/log';
import { commitmentEditUrl, reminderUnsubscribePostUrl, reminderUnsubscribeUrl } from '@/lib/links';
import { REMINDER_SETTLE_HOURS } from '@/lib/reminder-eligibility';
import { editTokenFor } from '@/lib/token';
import { REMINDER_LEAD_HOURS } from '@/schemas/signups';
import { holdsPlace } from '@/services/commitments';
import { reminderOptOutTokenFor } from '@/services/reminder-optout';
import { alreadyRecorded, loadCommitmentRow, slotText } from '@/email/commitment-row';
import { sendReminder } from '@/email/send';
import { getBoss, QUEUES, type ReminderSendPayload } from './queue';

/** The reminder lead time as a SQL interval. Fixed for every signup. */
const leadInterval = sql`make_interval(hours => ${REMINDER_LEAD_HOURS})`;

/**
 * When a commitment's reminder is due, as named SQL rules over a query joining
 * commitments, participants, slots and signups. Each rule holds when the
 * reminder may go out, and its name says why it can't when it doesn't. All
 * but the reminder.sent check, which the scan and the send job each make on
 * their own terms.
 *
 * The scan queues jobs with them and the send job re-reads its row through
 * them, because the job runs later: seconds normally, hours when the worker is
 * stopped or backed up. In that gap the organizer can archive the signup, turn
 * reminders off or move the slot, the participant can unsubscribe, and the
 * slot can pass. One set of rules means the two cannot disagree on any of it,
 * and the names let the job log which rule a skipped reminder failed.
 */
const reminderDueRules = {
  'commitment not active': holdsPlace,
  // 'closed' too, not just 'open'. Closing a signup means "no longer
  // collecting responses" — the commitments already made stay valid and
  // their participants still need the reminder. Excluding it silently
  // cancelled reminders whenever an organizer tidied up after sign-ups
  // ended, which the shorter default lead makes far more likely: at 24h,
  // closing the evening before the event now lands inside the window.
  // 'draft' and 'archived' stay excluded — never public, and put away.
  'signup not open or closed': or(eq(signups.status, 'open'), eq(signups.status, 'closed'))!,
  'signup deleted': isNull(signups.deletedAt),
  'slot has no date': isNotNull(slots.slotAt),
  // Still ahead of the participant, and inside the reminder lead time.
  'slot passed': sql`${slots.slotAt} > now()`,
  'slot beyond the lead time': sql`${slots.slotAt} <= now() + ${leadInterval}`,
  // Not still in the afterglow of their own confirmation (see selectDueReminders).
  'signed up too recently': sql`${commitments.createdAt} < now() - make_interval(hours => ${REMINDER_SETTLE_HOURS})`,
  'reminders off': sql`COALESCE((${signups.settings}->>'sendReminders')::boolean, true) = true`,
  // Participants who unsubscribed from this signup's reminders.
  'participant opted out': isNull(participants.remindersOptedOutAt),
  // Participants who gave no email: there is nowhere to send one.
  'participant has no email': isNotNull(participants.email),
} satisfies Record<string, SQL>;

/** Every rule in `reminderDueRules`: the reminder is due now. */
const reminderDueCondition = and(...Object.values(reminderDueRules))!;

/**
 * The names of the rules in `reminderDueRules` a commitment's reminder fails
 * right now, or null when there is no such commitment. Only for logging a
 * skipped send: it reads the same rules the condition is built from, so the
 * reasons cannot drift from what the scan and the job decide.
 */
async function reminderSkipReasons(db: Db, commitmentId: string): Promise<string[] | null> {
  const failed = Object.entries(reminderDueRules).map(
    ([reason, rule]) => sql`CASE WHEN coalesce(${rule}, false) THEN NULL ELSE ${reason}::text END`,
  );
  const [row] = await db
    .select({
      reasons: sql<string[]>`array_remove(ARRAY[${sql.join(failed, sql`, `)}], NULL)`,
    })
    .from(commitments)
    .innerJoin(slots, eq(slots.id, commitments.slotId))
    .innerJoin(signups, eq(signups.id, commitments.signupId))
    .innerJoin(participants, eq(participants.id, commitments.participantId))
    .where(eq(commitments.id, commitmentId))
    .limit(1);
  return row ? row.reasons : null;
}

/**
 * Selects the commitments whose reminder is *due* — slot still in the future,
 * but now within the signup's reminder lead time — and that have no
 * reminder.sent activity row yet.
 *
 * This is a "due now" test rather than a window around the lead time. A window
 * silently drops every reminder whose moment passed while the worker was down;
 * a due test re-selects those commitments on the next healthy tick, so an
 * outage delays reminders instead of losing them.
 *
 * The created_at guard suppresses only the genuinely redundant case: someone
 * who signed up in the last hour does not need a "coming up soon" email on the
 * heels of their confirmation. It is deliberately relative to *now* and not to
 * the reminder's due point — a guard of `created_at < slot_at - lead` reads
 * naturally but silently denies a reminder to anyone who commits inside the
 * lead window, so at a 72h lead every participant who signed up two days ahead
 * would get nothing at all.
 */
export async function selectDueReminders(db: Db): Promise<{ commitmentId: string }[]> {
  return db
    .select({ commitmentId: commitments.id })
    .from(commitments)
    .innerJoin(participants, eq(participants.id, commitments.participantId))
    .innerJoin(slots, eq(slots.id, commitments.slotId))
    .innerJoin(signups, eq(signups.id, commitments.signupId))
    .where(
      and(
        reminderDueCondition,
        // skip if a reminder was already recorded for this commitment
        sql`NOT EXISTS (
          SELECT 1 FROM activity a
          WHERE a.event_type = 'reminder.sent'
            AND (a.payload->>'commitmentId') = ${commitments.id}
        )`,
      ),
    );
}

/** Enqueues one reminders.send job per due commitment. */
export async function dispatchReminders(): Promise<{ enqueued: number }> {
  const rows = await selectDueReminders(getDb());

  if (rows.length === 0) return { enqueued: 0 };
  const boss = await getBoss();
  let enqueued = 0;
  for (const r of rows) {
    const payload: ReminderSendPayload = { commitmentId: r.commitmentId };
    // The singletonKey dedupes nothing here. pg-boss enforces it only on
    // short, singleton and stately queues, or with singletonSeconds, and this
    // queue is standard, so a commitment still due at the next scan gets
    // another job even while one is waiting or retrying. What stops a second
    // email is the reminder.sent check in sendReminderJob; once a send is
    // recorded, the NOT EXISTS above drops the commitment from later scans.
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
  const row = await loadCommitmentRow(db, payload.commitmentId, reminderDueCondition);

  // The scan's own rules, asked again of the row as it is now (see
  // reminderDueRules): anything that changed while the job waited, from an
  // archived signup to an unsubscribe to a slot moved later, shows up here as
  // no row. A second query then names the rules it failed, for the log.
  if (!row) {
    const reasons = await reminderSkipReasons(db, payload.commitmentId);
    if (reasons === null) {
      log.warn({ commitmentId: payload.commitmentId }, 'commitment not found for reminder');
    } else {
      log.info({ commitmentId: payload.commitmentId, reasons }, 'reminder no longer due; skipping');
    }
    return;
  }
  // reminderDueRules requires an email, so this only narrows the type.
  const to = row.participant.email;
  if (to === null) return;

  // Idempotency guard, and the only one: the queue does not dedupe (see
  // dispatchReminders), so a commitment can have several jobs, and the first
  // to send records reminder.sent for the rest to find here. A check, not a
  // lock: it holds only while a single worker process runs send jobs one at
  // a time. Two worker processes could each take a job for the same
  // commitment, both find no row here, and both send, which is why an
  // instance runs exactly one `pnpm worker`. It also cannot catch an email
  // that went out when recording it then failed; that job's retry sends it
  // again.
  if (await alreadyRecorded(db, 'reminder.sent', row.signup.id, payload.commitmentId)) {
    log.info({ commitmentId: payload.commitmentId }, 'reminder already sent; skipping');
    return;
  }

  const optOutToken = reminderOptOutTokenFor(row.participant.id);

  await sendReminder(
    to,
    {
      participantName: row.participant.name,
      signupTitle: row.signup.title,
      // Edit tokens are HMAC(secret, commitment_id), so the job can re-derive the
      // participant's own link without storing anything recoverable.
      manageUrl: commitmentEditUrl(
        row.signup.slug,
        row.commitment.id,
        editTokenFor(row.commitment.id),
      ),
      unsubscribeUrl: reminderUnsubscribeUrl(row.signup.slug, row.participant.id, optOutToken),
      ...(await slotText(db, row.signup.id, row.slot.values)),
      notes: row.commitment.notes,
    },
    { unsubscribePostUrl: reminderUnsubscribePostUrl(row.participant.id, optOutToken) },
  );

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
