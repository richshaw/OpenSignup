import { desc, eq, sql } from 'drizzle-orm';
import { activity, type ActivityEvent } from '@/db/schema/activity';
import { organizers } from '@/db/schema/organizers';
import type { Db, Queryable } from '@/db/client';
import { makeId } from './ids';
import { requireOrganizerId, type Actor } from './policy';

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
  const actorId = requireOrganizerId(actor);
  const clientId = actor.kind === 'organizer' ? actor.via?.clientId : undefined;
  return clientId ? { actorId, actorType: 'organizer', clientId } : { actorId, actorType: 'organizer' };
}

export async function recordActivity(
  db: Queryable,
  args: {
    signupId?: string | null;
    workspaceId?: string | null;
    actor: ActivityActor;
    eventType: ActivityEvent;
    payload?: Record<string, unknown>;
  },
) {
  const payload = args.actor.clientId
    ? { ...(args.payload ?? {}), viaClientId: args.actor.clientId }
    : (args.payload ?? {});
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

export async function listActivityForSignup(db: Db, signupId: string, limit = 100) {
  return db
    .select()
    .from(activity)
    .where(eq(activity.signupId, signupId))
    .orderBy(desc(activity.occurredAt))
    .limit(limit);
}
