import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';
import { log } from '@/lib/log';
import { commitmentEditUrl, publicSignupUrl } from '@/lib/links';
import { formatSlotWhen } from '@/lib/slot-time';
import { editTokenFor } from '@/lib/token';
import { DEFAULT_REMINDER_LEAD_HOURS } from '@/schemas/signups';
import { sendReminder } from '@/email/send';
import { getBoss, QUEUES, type ReminderSendPayload } from './queue';

/**
 * Per-signup reminder lead time, in hours, as a SQL interval. Signups created
 * before `reminderLeadHours` existed have no key in their settings jsonb and
 * fall back to the schema default, so no backfill is needed.
 */
const leadInterval = sql`make_interval(hours => COALESCE((${signups.settings}->>'reminderLeadHours')::int, ${DEFAULT_REMINDER_LEAD_HOURS}))`;

export interface DueReminder {
  commitmentId: string;
  participantEmail: string;
  signupTitle: string;
  slotRef: string;
  slotAt: Date | null;
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
 * The created_at guard keeps that catch-up honest: someone who commits *after*
 * their reminder was already due gets no reminder, because they just signed up
 * and a "coming up soon" email moments later is noise. It also bounds what the
 * catch-up can do on the first tick after a lead-time change.
 */
export async function selectDueReminders(db: Db): Promise<DueReminder[]> {
  return db
    .select({
      commitmentId: commitments.id,
      participantEmail: participants.email,
      signupTitle: signups.title,
      slotRef: slots.ref,
      slotAt: slots.slotAt,
    })
    .from(commitments)
    .innerJoin(participants, eq(participants.id, commitments.participantId))
    .innerJoin(slots, eq(slots.id, commitments.slotId))
    .innerJoin(signups, eq(signups.id, commitments.signupId))
    .where(
      and(
        or(eq(commitments.status, 'confirmed'), eq(commitments.status, 'tentative')),
        eq(signups.status, 'open'),
        isNull(signups.deletedAt),
        isNotNull(slots.slotAt),
        // Still ahead of the participant, and inside the reminder lead time.
        sql`${slots.slotAt} > now()`,
        sql`${slots.slotAt} <= now() + ${leadInterval}`,
        // Committed before the reminder came due (see doc comment).
        sql`${commitments.createdAt} < ${slots.slotAt} - ${leadInterval}`,
        sql`COALESCE((${signups.settings}->>'sendReminders')::boolean, true) = true`,
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
  if (row.signup.deletedAt) return;

  // Idempotency guard: if a prior attempt sent the email but failed to record
  // activity (causing a pg-boss retry), skip re-sending.
  const [alreadySent] = await db
    .select({ id: activity.id })
    .from(activity)
    .where(
      and(
        eq(activity.eventType, 'reminder.sent'),
        sql`(${activity.payload}->>'commitmentId') = ${payload.commitmentId}`,
      ),
    )
    .limit(1);
  if (alreadySent) {
    log.info({ commitmentId: payload.commitmentId }, 'reminder already sent; skipping');
    return;
  }

  await sendReminder(row.participant.email, {
    participantName: row.participant.name,
    signupTitle: row.signup.title,
    signupUrl: publicSignupUrl(row.signup.slug),
    // Edit tokens are HMAC(secret, commitment_id), so the job can re-derive the
    // participant's own link without storing anything recoverable.
    manageUrl: commitmentEditUrl(
      row.signup.slug,
      row.commitment.id,
      editTokenFor(row.commitment.id),
    ),
    slotLabel: row.slot.ref,
    slotDateLabel: formatSlotWhen(row.slot.slotAt) ?? 'Soon',
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

