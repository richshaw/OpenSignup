/**
 * Participant opt-out from reminder emails.
 *
 * Participants have no account, so the only thing that can authenticate an
 * unsubscribe request is a token in the link itself. Like edit tokens, these
 * are `HMAC(AUTH_SECRET, participantId + 'reminder-optout')` — derivable from
 * the row, so nothing extra is stored, and scoped by construction: an
 * unsubscribe token cannot be replayed as an edit token, or vice versa.
 *
 * The opt-out lives on `participants`, which is per-signup, so unsubscribing
 * from one organizer's snack rotation never silences another's.
 */
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { recordActivity } from '@/lib/activity';
import { err, ok, type Result } from '@/lib/result';
import { serviceError, type ServiceError } from '@/lib/errors';
import { editTokenFor, hashToken, verifyHash } from '@/lib/token';

const OPTOUT_SCOPE = 'reminder-optout';

export function reminderOptOutTokenFor(participantId: string): string {
  return editTokenFor(participantId, OPTOUT_SCOPE);
}

export interface OptOutTarget {
  participantId: string;
  participantEmail: string;
  signupTitle: string;
  signupSlug: string;
  optedOut: boolean;
}

interface LoadedTarget extends OptOutTarget {
  signupId: string;
  workspaceId: string | null;
}

async function loadVerified(
  db: Db,
  participantId: string,
  token: string,
): Promise<Result<LoadedTarget, ServiceError>> {
  // Constant-time, and checked before this function touches the DB, so a wrong
  // token costs no lookup and reveals nothing about whether the participant
  // exists. (The route consumes a rate limit before calling in, so the request
  // as a whole does still write one row.)
  if (!verifyHash(token, hashToken(reminderOptOutTokenFor(participantId)))) {
    return err(serviceError('forbidden', 'that unsubscribe link is not valid'));
  }

  const [row] = await db
    .select({
      participant: participants,
      signupId: signups.id,
      signupTitle: signups.title,
      signupSlug: signups.slug,
      workspaceId: signups.workspaceId,
    })
    .from(participants)
    .innerJoin(signups, eq(signups.id, participants.signupId))
    .where(and(eq(participants.id, participantId), isNull(signups.deletedAt)))
    .limit(1);

  if (!row) return err(serviceError('not_found', 'that sign-up could not be found'));

  return ok({
    participantId: row.participant.id,
    participantEmail: row.participant.email,
    signupTitle: row.signupTitle,
    signupSlug: row.signupSlug,
    optedOut: row.participant.remindersOptedOutAt !== null,
    signupId: row.signupId,
    workspaceId: row.workspaceId,
  });
}

function publicPart({ signupId: _id, workspaceId: _ws, ...rest }: LoadedTarget): OptOutTarget {
  return rest;
}

/** Reads the target of an unsubscribe link, for rendering the confirm page. */
export async function previewReminderOptOut(
  db: Db,
  participantId: string,
  token: string,
): Promise<Result<OptOutTarget, ServiceError>> {
  const found = await loadVerified(db, participantId, token);
  return found.ok ? ok(publicPart(found.value)) : found;
}

/**
 * Flips a participant's reminder opt-out and logs it, or does nothing if it is
 * already in the requested state.
 *
 * The state check lives in the UPDATE's own predicate, not in a prior read: two
 * concurrent POSTs — a browser double-submit, or a provider retry racing the
 * human click — would both see the pre-read value and both write an entry into
 * an append-only log that is supposed to record what happened, not how many
 * times it was asked. Only the update that actually changed a row writes the
 * activity row, in the same transaction, per CLAUDE.md.
 */
async function setOptOut(
  db: Db,
  target: LoadedTarget,
  optedOut: boolean,
): Promise<Result<OptOutTarget, ServiceError>> {
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(participants)
      .set({ remindersOptedOutAt: optedOut ? new Date() : null })
      .where(
        and(
          eq(participants.id, target.participantId),
          optedOut
            ? isNull(participants.remindersOptedOutAt)
            : isNotNull(participants.remindersOptedOutAt),
        ),
      )
      .returning({ id: participants.id });
    if (changed.length === 0) return;

    await recordActivity(tx, {
      signupId: target.signupId,
      workspaceId: target.workspaceId,
      actor: { actorId: target.participantId, actorType: 'participant' },
      eventType: optedOut ? 'reminder.opted_out' : 'reminder.opted_in',
      payload: { participantId: target.participantId },
    });
  });

  return ok({ ...publicPart(target), optedOut });
}

/** Applies the opt-out. Idempotent: unsubscribing twice is a no-op success. */
export async function optOutOfReminders(
  db: Db,
  participantId: string,
  token: string,
): Promise<Result<OptOutTarget, ServiceError>> {
  const found = await loadVerified(db, participantId, token);
  if (!found.ok) return found;
  return setOptOut(db, found.value, true);
}

/**
 * Turns reminders back on.
 *
 * Without this an opt-out is permanent and invisible: `participants` rows are
 * unique on (signupId, emailLower) and reused, so someone who unsubscribed from
 * the September rota and then signs up again in November for the *same* signup
 * silently gets no reminder, with no signal to them or the organizer. The same
 * token authorises both directions — it proves the same thing either way, and
 * the only page offering this is the one reached by that token.
 */
export async function optInToReminders(
  db: Db,
  participantId: string,
  token: string,
): Promise<Result<OptOutTarget, ServiceError>> {
  const found = await loadVerified(db, participantId, token);
  if (!found.ok) return found;
  return setOptOut(db, found.value, false);
}
