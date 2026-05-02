import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot, updateOwnCommitment } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';

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
  const memberId = makeId('mem');
  const slug = `test-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Test Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Test Workspace',
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

  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };

  return { db, workspaceId, organizerId, actor };
}

async function teardownWorkspace(db: Db, workspaceId: string, organizerId: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(organizers).where(eq(organizers.id, organizerId));
}

async function makeOpenSignupWithSlot(fx: Fixture, title: string) {
  const created = await createSignup(fx.db, fx.actor, fx.workspaceId, {
    title,
    description: '',
    tags: [],
    visibility: 'unlisted' as const,
    settings: {},
  });
  if (!created.ok) throw new Error(`createSignup failed: ${created.error.message}`);

  const slot = await addSlot(fx.db, fx.actor, created.value.id, {
    values: {},
    capacity: 5,
  });
  if (!slot.ok) throw new Error(`addSlot failed: ${slot.error.message}`);

  const pub = await publishSignup(fx.db, fx.actor, created.value.id);
  if (!pub.ok) throw new Error(`publishSignup failed: ${pub.error.message}`);

  return { signupId: created.value.id, slotId: slot.value.id };
}

describe('updateOwnCommitment swap (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('rejects a swap whose target slot is in a different signup', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup A');
    const b = await makeOpenSignupWithSlot(fx, 'Signup B');

    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Alice',
      email: 'alice@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const original = committed.value.commitment;
    const editToken = committed.value.editToken;

    const r = await updateOwnCommitment(fx.db, original.id, editToken, {
      swapToSlotId: b.slotId,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('forbidden');

    // Original commitment in signup A is still confirmed (transaction rolled back).
    const stillThere = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.id, original.id))
      .limit(1);
    expect(stillThere[0]?.status).toBe('confirmed');

    // No commitment row was created in signup B.
    const inB = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.signupId, b.signupId));
    expect(inB.length).toBe(0);
  });

  it('allows a swap to another slot within the same signup', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup C');
    const second = await addSlot(fx.db, fx.actor, a.signupId, {
      values: {},
      capacity: 5,
    });
    if (!second.ok) throw new Error(`second addSlot failed: ${second.error.message}`);

    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Bob',
      email: 'bob@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const original = committed.value.commitment;
    const editToken = committed.value.editToken;

    const r = await updateOwnCommitment(fx.db, original.id, editToken, {
      swapToSlotId: second.value.id,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slotId).toBe(second.value.id);
    expect(r.value.signupId).toBe(a.signupId);

    // Original is now cancelled; new commitment is on the second slot.
    const originalRow = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.id, original.id))
      .limit(1);
    expect(originalRow[0]?.status).toBe('cancelled');

    const onSecond = await fx.db
      .select()
      .from(commitments)
      .where(and(eq(commitments.slotId, second.value.id), eq(commitments.status, 'confirmed')));
    expect(onSecond.length).toBe(1);
  });
});
