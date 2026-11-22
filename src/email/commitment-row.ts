/**
 * What the confirmation email (`notify.ts`) and the worker's reminder and
 * slot-change jobs (`src/jobs/reminders.ts`, `src/jobs/slot-changes.ts`) read
 * about a commitment before emailing its participant, and the props those
 * emails share.
 */
import { and, eq, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import type { CatalogLocale } from '@/i18n/config';
import { localeOfSignup } from '@/i18n/locale';
import { joinCommitmentTables } from '@/jobs/notify-rules';
import { commitmentEditUrl } from '@/lib/links';
import { slotDetails, type SlotDetail } from '@/lib/slot-label';
import { summarizeSlotValues } from '@/lib/slot-summary';
import { listFieldsForSignup } from '@/services/slot-fields';

/**
 * The commitment with its slot, signup and participant, or undefined when there
 * is no such commitment or it fails `where`, a condition over those four tables.
 */
export async function loadCommitmentRow(db: Db, commitmentId: string, where?: SQL) {
  const [row] = await joinCommitmentTables(
    db
      .select({ commitment: commitments, slot: slots, signup: signups, participant: participants })
      .from(commitments)
      .$dynamic(),
  )
    .where(and(eq(commitments.id, commitmentId), where))
    .limit(1);
  return row;
}

/** A commitment as `loadCommitmentRow` reads it, with its slot, signup and participant. */
export type CommitmentRow = NonNullable<Awaited<ReturnType<typeof loadCommitmentRow>>>;

/**
 * The props every email to a participant about their commitment shares, in
 * its signup's language (`localeOfSignup`): who it's for, the signup, every
 * field of the slot, what they wrote and how many spots they took, and the
 * link that changes or cancels it.
 */
export async function commitmentEmailProps(db: Db, row: CommitmentRow, editToken: string) {
  const locale = localeOfSignup(row.signup.settings.locale);
  return {
    locale,
    participantName: row.participant.name,
    signupTitle: row.signup.title,
    manageUrl: commitmentEditUrl(row.signup.slug, row.commitment.id, editToken),
    ...(await slotText(db, row.signup.id, row.slot.values, locale)),
    notes: row.commitment.notes,
    quantity: row.commitment.quantity,
  };
}

/**
 * Every field the organizer defined, rendered the way the participant page
 * renders it in `locale`, so the email agrees with the page: as `Label: value`
 * lines, and on one line for the subject and preview. `slots.ref` is a slug and
 * never appears here.
 */
async function slotText(
  db: Db,
  signupId: string,
  values: unknown,
  locale: CatalogLocale,
): Promise<{ slotDetails: SlotDetail[]; slotSummary: string }> {
  const fields = await listFieldsForSignup(db, signupId);
  const slotValues = (values as Record<string, unknown>) ?? {};
  return {
    slotDetails: slotDetails(fields, slotValues, locale),
    slotSummary: summarizeSlotValues(fields, slotValues, locale),
  };
}
