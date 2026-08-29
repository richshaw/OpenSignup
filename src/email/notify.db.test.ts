import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { notifyCommitmentCreated } from './notify';

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  actor: Actor;
}

async function setupWorkspace(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `conf-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Confirm Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Confirm Workspace',
      type: 'personal',
      plan: 'free',
    });
    await tx.insert(workspaceMembers).values({
      id: makeId('mem'),
      workspaceId,
      organizerId,
      role: 'owner',
      status: 'active',
    });
  });

  return {
    db,
    workspaceId,
    organizerId,
    actor: {
      kind: 'organizer',
      id: organizerId,
      email,
      workspaceIds: [workspaceId],
      workspaceRoles: { [workspaceId]: 'owner' },
    },
  };
}

async function commitOnce(fx: Fixture, title: string) {
  const created = await createSignup(fx.db, fx.actor, fx.workspaceId, {
    title,
    description: '',
    tags: [],
    visibility: 'unlisted' as const,
    settings: {},
  });
  if (!created.ok) throw new Error(created.error.message);
  const slot = await addSlot(fx.db, fx.actor, created.value.id, { values: {}, capacity: 4 });
  if (!slot.ok) throw new Error(slot.error.message);
  const pub = await publishSignup(fx.db, fx.actor, created.value.id);
  if (!pub.ok) throw new Error(pub.error.message);
  const commit = await commitToSlot(fx.db, slot.value.id, {
    name: 'Dana Participant',
    email: `${slot.value.id.slice(-10).toLowerCase()}@example.test`,
    quantity: 1,
  });
  if (!commit.ok) throw new Error(commit.error.message);
  return { commitmentId: commit.value.commitment.id, editToken: commit.value.editToken };
}

async function confirmationRows(db: Db, commitmentId: string): Promise<number> {
  const rows = await db
    .select({ id: activity.id })
    .from(activity)
    .where(
      and(
        eq(activity.eventType, 'commitment.confirmation_sent'),
        sql`(${activity.payload}->>'commitmentId') = ${commitmentId}`,
      ),
    );
  return rows.length;
}

describe('notifyCommitmentCreated (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it('records a confirmation_sent activity row', async () => {
    const { commitmentId, editToken } = await commitOnce(fx, 'Confirm me');
    await notifyCommitmentCreated(fx.db, commitmentId, editToken);
    expect(await confirmationRows(fx.db, commitmentId)).toBe(1);
  });

  it('does not send twice for the same commitment', async () => {
    const { commitmentId, editToken } = await commitOnce(fx, 'Confirm once');
    await notifyCommitmentCreated(fx.db, commitmentId, editToken);
    await notifyCommitmentCreated(fx.db, commitmentId, editToken);
    expect(await confirmationRows(fx.db, commitmentId)).toBe(1);
  });

  it('swallows an unknown commitment instead of throwing', async () => {
    await expect(
      notifyCommitmentCreated(fx.db, makeId('com'), 'irrelevant'),
    ).resolves.toBeUndefined();
  });
});
