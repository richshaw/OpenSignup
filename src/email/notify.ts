/**
 * Post-mutation email side effects.
 *
 * Kept out of `src/services/*` because services are pure(-ish) `(db, actor,
 * input) => Result` functions that run inside DB tests, and out of route
 * handlers because those stay thin. Call these from `after()` so a slow or
 * failing mail server never delays or fails the participant's request.
 *
 * Every function here swallows its own errors: a confirmation email is a
 * courtesy, and losing one must never look like a failed sign-up.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';
import { commitmentEditUrl } from '@/lib/links';
import { log } from '@/lib/log';
import { willSendReminder } from '@/lib/reminder-eligibility';
import { formatSlotWhen } from '@/lib/slot-time';
import { SignupSettingsSchema } from '@/schemas/signups';
import { slotDisplayLabel } from '@/lib/slot-label';
import { listFieldsForSignup } from '@/services/slot-fields';
import { sendCommitmentConfirmation } from './send';

/**
 * Emails a participant the receipt for a commitment they just made, including
 * the token-bearing link they need to change or cancel it later.
 *
 * Unlike reminders this is transactional — it acknowledges an action the
 * participant took seconds ago — so it is not gated on the signup's reminder
 * settings.
 */
export async function notifyCommitmentCreated(
  db: Db,
  commitmentId: string,
  editToken: string,
): Promise<void> {
  try {
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
      .where(eq(commitments.id, commitmentId))
      .limit(1);

    if (!row) {
      log.warn({ commitmentId }, 'commitment not found for confirmation email');
      return;
    }

    // Belt and braces, not the primary defence. This is a read-then-write with
    // no lock, so it would not survive two concurrent calls for the same
    // commitment — but there is no path that produces them. This runs once per
    // successful POST (from `after()`), each successful POST inserts exactly
    // one commitment with a fresh UUIDv7 id, and a racing duplicate commit by
    // the same participant is rejected as `conflict` under the slot's
    // SELECT ... FOR UPDATE (src/services/commitments.ts). The check earns its
    // place only against a future caller that retries; if one is ever added,
    // the claim has to move before the send, not after it — an atomic guard
    // here would still leave the email already sent.
    const [alreadySent] = await db
      .select({ id: activity.id })
      .from(activity)
      .where(
        and(
          eq(activity.eventType, 'commitment.confirmation_sent'),
          // Scoped to the signup as well as the commitment: the row carries
          // signup_id anyway, and it keeps this off a full scan of every
          // confirmation ever sent even where the expression index is absent.
          eq(activity.signupId, row.signup.id),
          sql`(${activity.payload}->>'commitmentId') = ${commitmentId}`,
        ),
      )
      .limit(1);
    if (alreadySent) return;

    const settings = SignupSettingsSchema.safeParse(row.signup.settings ?? {});
    // Only promise a reminder the dispatcher would actually send. The gate is
    // the dispatcher's own rule (src/lib/reminder-eligibility.ts), not a
    // paraphrase of it: reminders on and a slot date are not enough, because a
    // slot less than an hour out is one the created_at guard can never reach.
    const remindersOn = settings.success ? settings.data.sendReminders : true;
    const reminderLeadHours = willSendReminder({
      sendReminders: remindersOn,
      slotAt: row.slot.slotAt,
      createdAt: row.commitment.createdAt,
    })
      ? settings.success
        ? settings.data.reminderLeadHours
        : null
      : null;

    // `slots.ref` is a slug, not a display name — use the label the
    // participant page shows, so the receipt names what they picked.
    const fields = await listFieldsForSignup(db, row.signup.id);
    const slotLabel = slotDisplayLabel(
      fields,
      (row.slot.values as Record<string, unknown>) ?? {},
      row.slot.ref,
      settings.success ? settings.data.groupByFieldRefs[0] : undefined,
    );

    await sendCommitmentConfirmation(row.participant.email, {
      participantName: row.participant.name,
      signupTitle: row.signup.title,
      manageUrl: commitmentEditUrl(row.signup.slug, row.commitment.id, editToken),
      slotLabel,
      slotDateLabel: formatSlotWhen(row.slot.slotAt),
      notes: row.commitment.notes,
      quantity: row.commitment.quantity,
      reminderLeadHours,
    });

    await recordActivity(db, {
      signupId: row.signup.id,
      workspaceId: row.signup.workspaceId,
      actor: { actorId: row.participant.id, actorType: 'participant' },
      eventType: 'commitment.confirmation_sent',
      payload: {
        commitmentId: row.commitment.id,
        participantId: row.participant.id,
        channel: 'email',
      },
    });
  } catch (err) {
    // A missed confirmation is a courtesy lost, not a failed sign-up. The
    // commitment is already committed; the participant has their link on
    // screen and in the returning-participant cookie.
    log.error({ err, commitmentId }, 'confirmation email failed');
  }
}
