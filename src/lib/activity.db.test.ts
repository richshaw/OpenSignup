import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { workspaceMembers } from '@/db/schema/members';
import { makeId } from '@/lib/ids';
import { recordActivity } from '@/lib/activity';

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
}

async function setup(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const memberId = makeId('mem');
  const slug = `act-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Activity Test Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Activity Test Workspace',
      type: 'personal',
      plan: 'free',
    });
    await tx.insert(workspaceMembers).values({
      id: memberId,
      workspaceId,
      organizerId,
      role: 'owner',
      status: 'active',
    });
  });

  return { db, workspaceId, organizerId };
}

async function teardown(db: Db, workspaceId: string, organizerId: string) {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(organizers).where(eq(organizers.id, organizerId));
}

async function readLastActiveAt(db: Db, organizerId: string): Promise<Date> {
  const rows = await db
    .select({ lastActiveAt: organizers.lastActiveAt })
    .from(organizers)
    .where(eq(organizers.id, organizerId));
  if (rows.length !== 1 || !rows[0]) throw new Error('organizer not found');
  return rows[0].lastActiveAt;
}

describe('recordActivity → organizers.last_active_at', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setup();
  });

  afterAll(async () => {
    await teardown(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('advances last_active_at when actorType is organizer', async () => {
    const before = await readLastActiveAt(fx.db, fx.organizerId);
    // Postgres `now()` is set at statement time and we want a strict `>`,
    // so wait long enough to clear sub-millisecond rounding.
    await new Promise((resolve) => setTimeout(resolve, 5));

    await recordActivity(fx.db, {
      signupId: null,
      workspaceId: fx.workspaceId,
      actor: { actorId: fx.organizerId, actorType: 'organizer' },
      eventType: 'auth.signed_in',
      payload: {},
    });

    const after = await readLastActiveAt(fx.db, fx.organizerId);
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it('does not advance last_active_at when actorType is system', async () => {
    const before = await readLastActiveAt(fx.db, fx.organizerId);
    await new Promise((resolve) => setTimeout(resolve, 5));

    await recordActivity(fx.db, {
      signupId: null,
      workspaceId: null,
      actor: { actorId: null, actorType: 'system' },
      eventType: 'auth.magic_link_sent',
      payload: { emailDomain: 'example.test', expiresInMinutes: 10 },
    });

    const after = await readLastActiveAt(fx.db, fx.organizerId);
    expect(after.getTime()).toBe(before.getTime());
  });
});
