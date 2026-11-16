/**
 * What the confirmation email (`notify.ts`) and the worker's reminder and
 * slot-change jobs (`src/jobs/reminders.ts`, `src/jobs/slot-changes.ts`) read
 * about a commitment before emailing its participant.
 */
import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { activity, type ActivityEvent } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { signupLocale, type CatalogLocale } from '@/i18n/config';
import { instanceDefaultLocale } from '@/i18n/server';
import { joinCommitmentTables } from '@/jobs/notify-rules';
import { slotDetails, type SlotDetail } from '@/lib/slot-label';
import { summarizeSlotValues } from '@/lib/slot-summary';
import type { StoredSignupSettings } from '@/schemas/signups';
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

/**
 * Whether an `eventType` row is already recorded for this commitment, such as
 * the `commitment.confirmation_sent` or `reminder.sent` that says its email
 * went out. `where`, a condition over `activity`, narrows which rows count.
 */
export async function alreadyRecorded(
  db: Db,
  eventType: ActivityEvent,
  signupId: string,
  commitmentId: string,
  where?: SQL,
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
        where,
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * The language a participant's emails about this signup are in: the signup's,
 * by the rule its pages follow (`signupLocale`), from the row
 * `loadCommitmentRow` already read. So the email is in the language of the
 * page its participant signed up on.
 */
export function emailLocale(signup: { settings: StoredSignupSettings }): CatalogLocale {
  return signupLocale(signup.settings.locale, instanceDefaultLocale());
}

/**
 * Every field the organizer defined, rendered the way the participant page
 * renders it in `locale`, so the email agrees with the page: as `Label: value`
 * lines, and on one line for the subject and preview. `slots.ref` is a slug and
 * never appears here.
 */
export async function slotText(
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
