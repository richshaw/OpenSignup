import { desc, eq } from 'drizzle-orm';
import { activity, type ActivityEvent } from '@/db/schema/activity';
import type { Db, Queryable } from '@/db/client';
import { makeId } from './ids';

export interface ActivityActor {
  actorId: string | null;
  actorType: 'organizer' | 'participant' | 'system';
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
  await db.insert(activity).values({
    id: makeId('act'),
    signupId: args.signupId ?? null,
    workspaceId: args.workspaceId ?? null,
    actorId: args.actor.actorId,
    actorType: args.actor.actorType,
    eventType: args.eventType,
    payload: args.payload ?? {},
  });
}

export async function listActivityForSignup(db: Db, signupId: string, limit = 100) {
  return db
    .select()
    .from(activity)
    .where(eq(activity.signupId, signupId))
    .orderBy(desc(activity.occurredAt))
    .limit(limit);
}
