import { desc, eq, sql } from 'drizzle-orm';
import { activity, type ActivityEvent } from '@/db/schema/activity';
import { organizers } from '@/db/schema/organizers';
import type { Db, Queryable } from '@/db/client';
import { makeId } from './ids';
import { log } from './log';
import { requireOrganizer, type Actor } from './policy';

export interface ActivityActor {
  actorId: string | null;
  actorType: 'organizer' | 'participant' | 'system';
  /** The connected app that made the change on the organizer's behalf, if any. */
  clientId?: string;
}

/**
 * The activity-log identity of an organizer actor. A browser session gives
 * a plain organizer row; a bearer-token session also names the connected
 * app, which `recordActivity` writes into the row's payload as
 * `viaClientId`. Throws `unauthorized` for participants and anonymous
 * actors, exactly like `requireOrganizerId`.
 */
export function activityActor(actor: Actor): ActivityActor {
  requireOrganizer(actor);
  return actor.via
    ? { actorId: actor.id, actorType: 'organizer', clientId: actor.via.clientId }
    : { actorId: actor.id, actorType: 'organizer' };
}

/**
 * The payload an activity row stores. `viaClientId` means a connected app
 * really made the change, so it comes only from the actor: a `viaClientId`
 * in the caller's payload is dropped, not trusted. Dropped rather than
 * thrown, because this runs inside the mutation's transaction and a bad
 * payload key should not cancel the organizer's actual change.
 */
export function activityPayload(
  actor: ActivityActor,
  payload?: Record<string, unknown> | null,
): Record<string, unknown> {
  const { viaClientId: _ignored, ...given } = payload ?? {};
  return actor.clientId ? { ...given, viaClientId: actor.clientId } : given;
}

interface RecordActivityArgs {
  signupId?: string | null;
  workspaceId?: string | null;
  actor: ActivityActor;
  eventType: ActivityEvent;
  payload?: Record<string, unknown>;
}

export async function recordActivity(db: Queryable, args: RecordActivityArgs) {
  const payload = activityPayload(args.actor, args.payload);
  await db.insert(activity).values({
    id: makeId('act'),
    signupId: args.signupId ?? null,
    workspaceId: args.workspaceId ?? null,
    actorId: args.actor.actorId,
    actorType: args.actor.actorType,
    eventType: args.eventType,
    payload,
  });

  if (args.actor.actorType === 'organizer' && args.actor.actorId !== null) {
    await db
      .update(organizers)
      .set({ lastActiveAt: sql`now()` })
      .where(eq(organizers.id, args.actor.actorId));
  }
}

/**
 * For telemetry-only events written outside any transaction: a failed
 * insert is logged and swallowed, so it never fails the operation the event
 * describes (a sign-in, a disconnect) after that operation has happened.
 *
 * Takes a `Db`, not a `Tx`, on purpose. Inside a transaction a failed insert
 * aborts the whole transaction even though the error is swallowed here, and
 * the caller's next statement fails somewhere unrelated. Telemetry that has
 * to be written from inside one needs a savepoint, as
 * `safeRecordAttemptFailed` in src/services/commitments.ts does.
 */
export async function recordActivityBestEffort(db: Db, args: RecordActivityArgs): Promise<void> {
  try {
    await recordActivity(db, args);
  } catch (err) {
    log.warn({ err, eventType: args.eventType }, 'recordActivity failed');
  }
}

export async function listActivityForSignup(db: Db, signupId: string, limit = 100) {
  return db
    .select()
    .from(activity)
    .where(eq(activity.signupId, signupId))
    .orderBy(desc(activity.occurredAt))
    .limit(limit);
}
