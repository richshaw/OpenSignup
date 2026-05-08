import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot, updateSlot } from '@/services/slots';

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

async function makeOpenSignupWithSlot(fx: Fixture, title: string, capacity: number) {
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
    capacity,
  });
  if (!slot.ok) throw new Error(`addSlot failed: ${slot.error.message}`);

  const pub = await publishSignup(fx.db, fx.actor, created.value.id);
  if (!pub.ok) throw new Error(`publishSignup failed: ${pub.error.message}`);

  return { signupId: created.value.id, slotId: slot.value.id };
}

describe('updateSlot capacity validation (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('rejects lowering capacity below total committed quantity', async () => {
    const { slotId } = await makeOpenSignupWithSlot(fx, 'Capacity quantity test', 5);

    // One commitment with quantity=3 → total quantity in use is 3.
    const committed = await commitToSlot(fx.db, slotId, {
      name: 'Alice',
      email: 'alice-qty@example.test',
      quantity: 3,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);

    // Lowering to 2 should be rejected because sum(quantity)=3 > 2.
    const result = await updateSlot(fx.db, fx.actor, slotId, { capacity: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('conflict');
    expect(result.error.message).toContain('active quantity (3)');
  });

  it('allows lowering capacity to exactly the total committed quantity', async () => {
    const { slotId } = await makeOpenSignupWithSlot(fx, 'Capacity exact match test', 5);

    const committed = await commitToSlot(fx.db, slotId, {
      name: 'Bob',
      email: 'bob-qty@example.test',
      quantity: 3,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);

    // Lowering to exactly 3 should succeed (3 is not > 3).
    const result = await updateSlot(fx.db, fx.actor, slotId, { capacity: 3 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.capacity).toBe(3);
  });
});
