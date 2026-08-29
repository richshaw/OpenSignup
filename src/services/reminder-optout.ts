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
import { and, eq, isNull } from 'drizzle-orm';
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

/** Applies the opt-out. Idempotent: unsubscribing twice is a no-op success. */
export async function optOutOfReminders(
  db: Db,
  participantId: string,
  token: string,
): Promise<Result<OptOutTarget, ServiceError>> {
  const found = await loadVerified(db, participantId, token);
  if (!found.ok) return found;
  const target = found.value;
  if (target.optedOut) return ok(publicPart(target));

  // Same transaction as the mutation it describes, per CLAUDE.md. Split, a
  // failed activity insert leaves the participant opted out while the request
  // returns a 500 — they are told it failed and the log has no record of it.
  await db.transaction(async (tx) => {
    await tx
      .update(participants)
      .set({ remindersOptedOutAt: new Date() })
      .where(eq(participants.id, participantId));

    await recordActivity(tx, {
      signupId: target.signupId,
      workspaceId: target.workspaceId,
      actor: { actorId: participantId, actorType: 'participant' },
      eventType: 'reminder.opted_out',
      payload: { participantId },
    });
  });

  return ok({ ...publicPart(target), optedOut: true });
}
