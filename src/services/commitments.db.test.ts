import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import {
  cancelOwnCommitment,
  commitToSlot,
  updateOwnCommitment,
} from '@/services/commitments';
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

describe('cancelOwnCommitment (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('cancels a confirmed commitment and writes exactly one activity row', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Cancel Confirmed');
    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Carla',
      email: 'carla@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const { commitment, editToken } = committed.value;

    const r = await cancelOwnCommitment(fx.db, commitment.id, editToken);
    expect(r.ok).toBe(true);

    const row = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.id, commitment.id))
      .limit(1);
    expect(row[0]?.status).toBe('cancelled');
    expect(row[0]?.cancelledAt).not.toBeNull();

    const events = await fx.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.signupId, a.signupId),
          eq(activity.eventType, 'commitment.cancelled'),
        ),
      );
    expect(events.length).toBe(1);
  });

  it('allows a waitlisted participant to cancel themselves', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Cancel Waitlist');
    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Wendy',
      email: 'wendy@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const { commitment, editToken } = committed.value;

    // Force the row into the 'waitlist' status — simulates capacity-overflow path.
    await fx.db
      .update(commitments)
      .set({ status: 'waitlist' })
      .where(eq(commitments.id, commitment.id));

    const r = await cancelOwnCommitment(fx.db, commitment.id, editToken);
    expect(r.ok).toBe(true);

    const row = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.id, commitment.id))
      .limit(1);
    expect(row[0]?.status).toBe('cancelled');
  });

  it('is idempotent: a second cancel returns ok and does not double-log activity', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Cancel Idempotent');
    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Ivan',
      email: 'ivan@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const { commitment, editToken } = committed.value;

    const first = await cancelOwnCommitment(fx.db, commitment.id, editToken);
    expect(first.ok).toBe(true);

    const second = await cancelOwnCommitment(fx.db, commitment.id, editToken);
    expect(second.ok).toBe(true);

    const events = await fx.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.signupId, a.signupId),
          eq(activity.eventType, 'commitment.cancelled'),
        ),
      );
    expect(events.length).toBe(1);
  });

  it('rejects cancelling an organizer-applied terminal status (no_show)', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Cancel NoShow');
    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Nora',
      email: 'nora@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const { commitment, editToken } = committed.value;

    await fx.db
      .update(commitments)
      .set({ status: 'no_show' })
      .where(eq(commitments.id, commitment.id));

    const r = await cancelOwnCommitment(fx.db, commitment.id, editToken);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('conflict');

    const row = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.id, commitment.id))
      .limit(1);
    expect(row[0]?.status).toBe('no_show');
  });

  it('handles two concurrent cancels: one writes activity, both return ok', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Cancel Race');
    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Rita',
      email: 'rita@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const { commitment, editToken } = committed.value;

    const [r1, r2] = await Promise.all([
      cancelOwnCommitment(fx.db, commitment.id, editToken),
      cancelOwnCommitment(fx.db, commitment.id, editToken),
    ]);
    // Both should be ok — the loser sees status='cancelled' on its pre-flight read
    // and takes the idempotent success path.
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const events = await fx.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.signupId, a.signupId),
          eq(activity.eventType, 'commitment.cancelled'),
        ),
      );
    expect(events.length).toBe(1);
  });
});
