import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';
import { log } from '@/lib/log';
import { commitmentEditUrl, publicSignupUrl, reminderUnsubscribeUrl } from '@/lib/links';
import { REMINDER_SETTLE_HOURS } from '@/lib/reminder-eligibility';
import { formatSlotWhen } from '@/lib/slot-time';
import { editTokenFor } from '@/lib/token';
import { DEFAULT_REMINDER_LEAD_HOURS, SignupSettingsSchema } from '@/schemas/signups';
import { slotDisplayLabel } from '@/lib/slot-label';
import { listFieldsForSignup, slotTimeOfDay } from '@/services/slot-fields';
import { reminderOptOutTokenFor } from '@/services/reminder-optout';
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
 * The created_at guard suppresses only the genuinely redundant case: someone
 * who signed up in the last hour does not need a "coming up soon" email on the
 * heels of their confirmation. It is deliberately relative to *now* and not to
 * the reminder's due point — a guard of `created_at < slot_at - lead` reads
 * naturally but silently denies a reminder to anyone who commits inside the
 * lead window, so at a 72h lead every participant who signed up two days ahead
 * would get nothing at all.
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
        // 'closed' too, not just 'open'. Closing a signup means "no longer
        // collecting responses" — the commitments already made stay valid and
        // their participants still need the reminder. Excluding it silently
        // cancelled reminders whenever an organizer tidied up after sign-ups
        // ended, which the shorter default lead makes far more likely: at 24h,
        // closing the evening before the event now lands inside the window.
        // 'draft' and 'archived' stay excluded — never public, and put away.
        or(eq(signups.status, 'open'), eq(signups.status, 'closed')),
        isNull(signups.deletedAt),
        isNotNull(slots.slotAt),
        // Still ahead of the participant, and inside the reminder lead time.
        sql`${slots.slotAt} > now()`,
        sql`${slots.slotAt} <= now() + ${leadInterval}`,
        // Not still in the afterglow of their own confirmation (see doc comment).
        sql`${commitments.createdAt} < now() - make_interval(hours => ${REMINDER_SETTLE_HOURS})`,
        sql`COALESCE((${signups.settings}->>'sendReminders')::boolean, true) = true`,
        // Participants who unsubscribed from this signup's reminders.
        isNull(participants.remindersOptedOutAt),
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

  // The slot's `ref` is a slug, not a display name — read the label the
  // participant page shows so the email agrees with it.
  const fields = await listFieldsForSignup(db, row.signup.id);
  const settings = SignupSettingsSchema.safeParse(row.signup.settings ?? {});
  const groupRef = settings.success ? settings.data.groupByFieldRefs[0] : undefined;
  const slotValues = (row.slot.values as Record<string, unknown>) ?? {};
  const slotLabel = slotDisplayLabel(fields, slotValues, row.slot.ref, groupRef);
  // Asked explicitly rather than inferred from the instant: a slot at a genuine
  // 00:00 is indistinguishable from a date-only slot once stored.
  const hasTime =
    slotTimeOfDay(
      (row.signup.settings as Record<string, unknown> | null) ?? {},
      fields,
      slotValues,
    ) !== null;

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
    unsubscribeUrl: reminderUnsubscribeUrl(
      row.signup.slug,
      row.participant.id,
      reminderOptOutTokenFor(row.participant.id),
    ),
    slotLabel,
    slotDateLabel: formatSlotWhen(row.slot.slotAt, { hasTime }) ?? 'Soon',
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
