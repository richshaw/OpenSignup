import { and, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { holdsPlace } from '@/services/commitments';

/**
 * Who the worker may email about a slot they hold, as named SQL rules over a
 * query joining commitments, participants, slots and signups. Reminders and
 * slot-change emails both start from these, so the reminders setting and a
 * participant's unsubscribe silence both, and a change to one rule is a
 * change to both. Each rule holds when the email may go out, and its name says
 * why it can't when it doesn't.
 *
 * The confirmation's promise of a reminder is the TypeScript side of the same
 * switches (`willSendReminder` in src/lib/reminder-eligibility.ts).
 */
export const notifiableRules = {
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
  'slot passed': sql`${slots.slotAt} > now()`,
  'reminders off': sql`COALESCE((${signups.settings}->>'sendReminders')::boolean, true) = true`,
  // Participants who unsubscribed from this signup's reminders.
  'participant opted out': isNull(participants.remindersOptedOutAt),
  // Participants who gave no email: there is nowhere to send one.
  'participant has no email': isNotNull(participants.email),
} satisfies Record<string, SQL>;

/**
 * The names of the rules in `rules` a commitment fails right now, or null when
 * there is no such commitment. Only for logging a skipped send: it reads the
 * same rules the condition is built from, so the reasons cannot drift from
 * what the scan and the job decide.
 */
export async function skipReasons(
  db: Db,
  commitmentId: string,
  rules: Record<string, SQL>,
): Promise<string[] | null> {
  const failed = Object.entries(rules).map(
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

/** Every rule in `rules`, joined with AND. */
export function allOf(rules: Record<string, SQL>): SQL {
  return and(...Object.values(rules))!;
}

/**
 * The emails that tell a participant their slot's time: the confirmation, a
 * reminder and a slot-change email. The newest of them is what the
 * participant was last told.
 */
const TOLD_EVENTS = sql`('commitment.confirmation_sent', 'reminder.sent', 'slot.change_sent')`;

/**
 * Whether the slot time the participant was last told differs from the slot's
 * time now. SQL over the same four-table join as the rules above.
 *
 * The newest told email is found in the activity log. A reminder or change
 * email names its `slotAt`. A confirmation (and a reminder from before
 * reminders named their time) does not, so its time is read off the slot's
 * moves instead: the slot was at the `from` of the first `slot.rescheduled`
 * after that email, or, with no move since, where it is now. No told email at
 * all (the confirmation failed) counts from the commitment's creation, the
 * same way. Both sides are cut to milliseconds, the precision of the ISO
 * strings in the payloads.
 */
export const toldDifferentTime: SQL = (() => {
  const lastTold = (column: SQL) => sql`(
    SELECT ${column} FROM activity t
    WHERE t.event_type IN ${TOLD_EVENTS}
      AND t.signup_id = ${commitments.signupId}
      AND (t.payload->>'commitmentId') = ${commitments.id}
    ORDER BY t.occurred_at DESC
    LIMIT 1
  )`;
  const toldAt = sql`coalesce(${lastTold(sql`t.occurred_at`)}, ${commitments.createdAt})`;
  const toldSlotAt = lastTold(sql`t.payload->'slotAt'`);
  // jsonb, so "no move since" (SQL NULL) and "moved from no time" (JSON null)
  // stay apart.
  const firstMoveFrom = sql`(
    SELECT m.payload->'from' FROM activity m
    WHERE m.event_type = 'slot.rescheduled'
      AND m.signup_id = ${commitments.signupId}
      AND (m.payload->>'slotId') = ${slots.id}
      AND m.occurred_at > ${toldAt}
    ORDER BY m.occurred_at ASC
    LIMIT 1
  )`;
  const now = sql`date_trunc('milliseconds', ${slots.slotAt})`;
  return sql`(CASE
    WHEN ${toldSlotAt} IS NOT NULL
      THEN (${toldSlotAt} #>> '{}')::timestamptz IS DISTINCT FROM ${now}
    ELSE ${firstMoveFrom} IS NOT NULL
      AND (${firstMoveFrom} #>> '{}')::timestamptz IS DISTINCT FROM ${now}
  END)`;
})();

/** `toldDifferentTime` for one commitment. False when there is no such commitment. */
export async function wasToldDifferentTime(db: Db, commitmentId: string): Promise<boolean> {
  const [row] = await db
    .select({ differs: sql<boolean>`${toldDifferentTime}` })
    .from(commitments)
    .innerJoin(slots, eq(slots.id, commitments.slotId))
    .where(eq(commitments.id, commitmentId))
    .limit(1);
  return row?.differs === true;
}
