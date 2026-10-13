/**
 * What the confirmation email (`notify.ts`) and the reminder job
 * (`src/jobs/reminders.ts`) both read about a commitment before emailing its
 * participant.
 */
import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { activity, type ActivityEvent } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { slotDetails, type SlotDetail } from '@/lib/slot-label';
import { summarizeSlotValues } from '@/lib/slot-summary';
import { listFieldsForSignup } from '@/services/slot-fields';

/**
 * The commitment with its slot, signup and participant, or undefined when there
 * is no such commitment or it fails `where`, a condition over those four tables.
 */
export async function loadCommitmentRow(db: Db, commitmentId: string, where?: SQL) {
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
    .where(and(eq(commitments.id, commitmentId), where))
    .limit(1);
  return row;
}

/**
 * Whether an `eventType` row is already recorded for this commitment, such as
 * the `commitment.confirmation_sent` or `reminder.sent` that says its email
 * went out.
 */
export async function alreadyRecorded(
  db: Db,
  eventType: ActivityEvent,
  signupId: string,
  commitmentId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: activity.id })
    .from(activity)
    .where(
      and(
        eq(activity.eventType, eventType),
        // Scoped to the signup as well as the commitment: the row carries
        // signup_id anyway, and it keeps this off a full scan of every such
        // event ever recorded even where the expression index is absent.
        eq(activity.signupId, signupId),
        sql`(${activity.payload}->>'commitmentId') = ${commitmentId}`,
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Every field the organizer defined, rendered the way the participant page
 * renders it, so the email agrees with the page: as `Label: value` lines, and
 * on one line for the subject and preview. `slots.ref` is a slug and never
 * appears here.
 */
export async function slotText(
  db: Db,
  signupId: string,
  values: unknown,
): Promise<{ slotDetails: SlotDetail[]; slotSummary: string }> {
  const fields = await listFieldsForSignup(db, signupId);
  const slotValues = (values as Record<string, unknown>) ?? {};
  return {
    slotDetails: slotDetails(fields, slotValues),
    slotSummary: summarizeSlotValues(fields, slotValues),
  };
}
