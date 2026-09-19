import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot, addSlotsBulk, listSlotsForSignup, updateSlot } from '@/services/slots';

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

describe('addSlotsBulk beforeSlotId (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  const what = (row: { values: unknown }) => (row.values as { what?: string }).what;

  /** A signup whose slots are named a, b, c… and carry the given sortOrders. */
  async function makeSignup(title: string, sortOrders: number[]) {
    const names = sortOrders.map((_, i) => String.fromCharCode(97 + i));
    const created = await createSignup(
      fx.db,
      fx.actor,
      fx.workspaceId,
      { title },
      {
        template: {
          id: 'order-test',
          fields: [
            {
              ref: 'what',
              label: 'What',
              fieldType: 'text',
              sortOrder: 0,
              config: { fieldType: 'text', maxLength: 200 },
            },
          ],
          slots: sortOrders.map((sortOrder, i) => ({
            capacity: 1,
            values: { what: names[i] },
            sortOrder,
          })),
        },
      },
    );
    if (!created.ok) throw new Error(`createSignup failed: ${created.error.message}`);
    const rows = await listSlotsForSignup(fx.db, created.value.id);
    const idOf = (name: string) => rows.find((r) => what(r) === name)!.id;
    return { signupId: created.value.id, idOf };
  }

  async function shown(signupId: string) {
    const rows = await listSlotsForSignup(fx.db, signupId);
    return {
      names: rows.map(what),
      sortOrders: rows.map((r) => r.sortOrder),
    };
  }

  it('puts a slot in front of the first one', async () => {
    const { signupId, idOf } = await makeSignup('Before first', [0, 1, 2]);
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'new' } }],
      beforeSlotId: idOf('a'),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((s) => s.sortOrder)).toEqual([0]);
    expect(await shown(signupId)).toEqual({
      names: ['new', 'a', 'b', 'c'],
      sortOrders: [0, 1, 2, 3],
    });
  });

  it('puts several slots in front of a middle one, in the order given', async () => {
    const { signupId, idOf } = await makeSignup('Before middle', [0, 1, 2]);
    const untouched = (await listSlotsForSignup(fx.db, signupId))[0]!;
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'x' } }, { values: { what: 'y' } }, { values: { what: 'z' } }],
      beforeSlotId: idOf('b'),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    // The returned rows carry the order they ended up with, not the one they
    // were inserted under.
    expect(r.value.map((s) => [what(s), s.sortOrder])).toEqual([
      ['x', 1],
      ['y', 2],
      ['z', 3],
    ]);
    expect(await shown(signupId)).toEqual({
      names: ['a', 'x', 'y', 'z', 'b', 'c'],
      sortOrders: [0, 1, 2, 3, 4, 5],
    });
    // Slot a kept its order, so the renumbering left its row alone.
    const after = (await listSlotsForSignup(fx.db, signupId))[0]!;
    expect(after.id).toBe(untouched.id);
    expect(after.updatedAt.getTime()).toBe(untouched.updatedAt.getTime());
  });

  it('lands first when every existing slot is tied at 0', async () => {
    // The bug in #250: a new slot sent with sortOrder 0 tied with the first
    // slot, lost the createdAt tiebreak and showed second.
    const { signupId, idOf } = await makeSignup('Tied', [0, 0, 0]);
    const before = await shown(signupId);
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'new' } }],
      beforeSlotId: idOf(String(before.names[0])),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await shown(signupId)).toEqual({
      names: ['new', ...before.names],
      sortOrders: [0, 1, 2, 3],
    });
  });

  it('closes the gaps when existing orders are sparse', async () => {
    const { signupId, idOf } = await makeSignup('Sparse', [10, 1_700_000_000, 1_700_000_050]);
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'new' } }],
      beforeSlotId: idOf('c'),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await shown(signupId)).toEqual({
      names: ['a', 'b', 'new', 'c'],
      sortOrders: [0, 1, 2, 3],
    });
  });

  it('refuses an id that is not a slot of this signup, and writes nothing', async () => {
    const { signupId } = await makeSignup('Unknown target', [0, 1]);
    const other = await makeSignup('Someone else', [0]);
    for (const beforeSlotId of ['slot_nope', other.idOf('a')]) {
      const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
        rows: [{ values: { what: 'new' } }],
        beforeSlotId,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toMatchObject({ code: 'invalid_input', field: 'beforeSlotId' });
      expect(r.error.suggestion).toContain('get_signup');
    }
    expect(await shown(signupId)).toEqual({ names: ['a', 'b'], sortOrders: [0, 1] });
    expect(await shown(other.signupId)).toEqual({ names: ['a'], sortOrders: [0] });
    const acts = await fx.db.select().from(activity).where(eq(activity.signupId, signupId));
    expect(acts.filter((a) => a.eventType === 'slot.created')).toHaveLength(0);
  });

  it('refuses beforeSlotId together with a row sortOrder', async () => {
    const { signupId, idOf } = await makeSignup('Both', [0, 1]);
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'new' } }, { values: { what: 'newer' }, sortOrder: 0 }],
      beforeSlotId: idOf('a'),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ code: 'invalid_input', field: 'rows.1.sortOrder' });
    expect(await shown(signupId)).toEqual({ names: ['a', 'b'], sortOrders: [0, 1] });
  });

  it('still appends at the end without beforeSlotId', async () => {
    const { signupId } = await makeSignup('Append', [0, 0, 7]);
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'x' } }, { values: { what: 'y' } }],
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((s) => s.sortOrder)).toEqual([8, 9]);
    // Nothing that was already there moved.
    expect((await shown(signupId)).sortOrders).toEqual([0, 0, 7, 8, 9]);
  });

  it('an append and an insert-before running at once leave no tied orders', async () => {
    const { signupId, idOf } = await makeSignup('Race', [0, 1, 2]);
    const [a, b] = await Promise.all([
      addSlotsBulk(fx.db, fx.actor, signupId, {
        rows: [{ values: { what: 'end1' } }, { values: { what: 'end2' } }],
      }),
      addSlotsBulk(fx.db, fx.actor, signupId, {
        rows: [{ values: { what: 'top1' } }, { values: { what: 'top2' } }],
        beforeSlotId: idOf('a'),
      }),
    ]);
    expect(a.ok, JSON.stringify(a)).toBe(true);
    expect(b.ok, JSON.stringify(b)).toBe(true);
    // Whichever took the signup lock first, the result is the same.
    expect(await shown(signupId)).toEqual({
      names: ['top1', 'top2', 'a', 'b', 'c', 'end1', 'end2'],
      sortOrders: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it('records one slot.created row that names the slot it went in front of', async () => {
    const { signupId, idOf } = await makeSignup('Activity', [0, 1]);
    const target = idOf('b');
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'x' } }, { values: { what: 'y' } }],
      beforeSlotId: target,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    const acts = await fx.db.select().from(activity).where(eq(activity.signupId, signupId));
    const createdEvents = acts.filter((a) => a.eventType === 'slot.created');
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0]!.payload).toMatchObject({
      count: 2,
      bulk: true,
      slotIds: r.value.map((s) => s.id),
      beforeSlotId: target,
    });
  });
});
