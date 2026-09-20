import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import {
  addSlot,
  addSlotsBulk,
  deleteSlot,
  listSlotsForSignup,
  reorderSlots,
  updateSlot,
  writeSlotOrder,
} from '@/services/slots';
import { whileSigningUp } from '@/services/testing/locks';

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

const what = (row: { values: unknown }) => (row.values as { what?: string }).what;

/** A signup whose slots are named a, b, c… and carry the given sortOrders. */
async function makeSignup(fx: Fixture, title: string, sortOrders: number[]) {
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

async function shown(fx: Fixture, signupId: string) {
  const rows = await listSlotsForSignup(fx.db, signupId);
  return {
    names: rows.map(what),
    sortOrders: rows.map((r) => r.sortOrder),
  };
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

  it('puts a slot in front of the first one', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Before first', [0, 1, 2]);
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'new' } }],
      beforeSlotId: idOf('a'),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((s) => s.sortOrder)).toEqual([0]);
    expect(await shown(fx, signupId)).toEqual({
      names: ['new', 'a', 'b', 'c'],
      sortOrders: [0, 1, 2, 3],
    });
  });

  it('puts several slots in front of a middle one, in the order given', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Before middle', [0, 1, 2]);
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
    expect(await shown(fx, signupId)).toEqual({
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
    const { signupId, idOf } = await makeSignup(fx, 'Tied', [0, 0, 0]);
    const before = await shown(fx, signupId);
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'new' } }],
      beforeSlotId: idOf(String(before.names[0])),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await shown(fx, signupId)).toEqual({
      names: ['new', ...before.names],
      sortOrders: [0, 1, 2, 3],
    });
  });

  it('closes the gaps when existing orders are sparse', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Sparse', [10, 1_700_000_000, 1_700_000_050]);
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'new' } }],
      beforeSlotId: idOf('c'),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await shown(fx, signupId)).toEqual({
      names: ['a', 'b', 'new', 'c'],
      sortOrders: [0, 1, 2, 3],
    });
  });

  it('refuses an id that is not a slot of this signup, and writes nothing', async () => {
    const { signupId } = await makeSignup(fx, 'Unknown target', [0, 1]);
    const other = await makeSignup(fx, 'Someone else', [0]);
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
    expect(await shown(fx, signupId)).toEqual({ names: ['a', 'b'], sortOrders: [0, 1] });
    expect(await shown(fx, other.signupId)).toEqual({ names: ['a'], sortOrders: [0] });
    const acts = await fx.db.select().from(activity).where(eq(activity.signupId, signupId));
    expect(acts.filter((a) => a.eventType === 'slot.created')).toHaveLength(0);
  });

  it('refuses beforeSlotId together with a row sortOrder', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Both', [0, 1]);
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'new' } }, { values: { what: 'newer' }, sortOrder: 0 }],
      beforeSlotId: idOf('a'),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ code: 'invalid_input', field: 'rows.1.sortOrder' });
    expect(await shown(fx, signupId)).toEqual({ names: ['a', 'b'], sortOrders: [0, 1] });
  });

  it('still appends at the end without beforeSlotId', async () => {
    const { signupId } = await makeSignup(fx, 'Append', [0, 0, 7]);
    const r = await addSlotsBulk(fx.db, fx.actor, signupId, {
      rows: [{ values: { what: 'x' } }, { values: { what: 'y' } }],
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((s) => s.sortOrder)).toEqual([8, 9]);
    // Nothing that was already there moved.
    expect((await shown(fx, signupId)).sortOrders).toEqual([0, 0, 7, 8, 9]);
  });

  it('an append and an insert-before running at once leave no tied orders', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Race', [0, 1, 2]);
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
    expect(await shown(fx, signupId)).toEqual({
      names: ['top1', 'top2', 'a', 'b', 'c', 'end1', 'end2'],
      sortOrders: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it('a slot deleted or added without the lock leaves a gap or lands last, not a tie', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Stale list', [0, 1, 2]);
    // The list an insert-before read, before two single-slot calls that do not
    // take the signup lock got in ahead of its renumbering.
    const stale = [idOf('c'), idOf('b'), idOf('a')];
    expect((await deleteSlot(fx.db, fx.actor, idOf('b'))).ok).toBe(true);
    expect((await addSlot(fx.db, fx.actor, signupId, { values: { what: 'late' } })).ok).toBe(true);

    await fx.db.transaction((tx) => writeSlotOrder(tx, signupId, stale));

    const after = await shown(fx, signupId);
    expect(after.names).toEqual(['c', 'a', 'late']);
    expect(after.sortOrders.slice(0, 2)).toEqual([0, 2]);
    expect(new Set(after.sortOrders).size).toBe(3);
  });

  it('waits for a delete in flight, and refuses if the target is the slot that went', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Delete race', [0, 1, 2]);
    let adding: ReturnType<typeof addSlotsBulk> | undefined;
    await fx.db.transaction(async (tx) => {
      // What `deleteSlot` does, held open: it takes the slot row, not the signup.
      await tx.delete(slots).where(eq(slots.id, idOf('b')));
      adding = addSlotsBulk(fx.db, fx.actor, signupId, {
        rows: [{ values: { what: 'x' } }],
        beforeSlotId: idOf('b'),
      });
      adding.catch(() => undefined);
      // Long enough for the add to read the slots. Reading without locking the
      // rows would still see `b` and carry on as if it were there.
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const r = await adding!;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: 'invalid_input', field: 'beforeSlotId' });
    expect(await shown(fx, signupId)).toEqual({ names: ['a', 'c'], sortOrders: [0, 2] });
  });

  it('does not deadlock with someone signing up for a slot that has to move', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Commit race', [0, 1]);
    const at = { signupId, workspaceId: fx.workspaceId, slotId: idOf('a') };
    const r = await whileSigningUp(fx.db, at, () =>
      addSlotsBulk(fx.db, fx.actor, signupId, {
        rows: [{ values: { what: 'top' } }],
        beforeSlotId: idOf('a'),
      }),
    );
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((await shown(fx, signupId)).names).toEqual(['top', 'a', 'b']);
  });

  it('records one slot.created row that names the slot it went in front of', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Activity', [0, 1]);
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

describe('reorderSlots (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  async function reorderEvents(signupId: string) {
    const acts = await fx.db.select().from(activity).where(eq(activity.signupId, signupId));
    return acts.filter((a) => a.eventType === 'slot.reordered');
  }

  it('numbers the slots 0..n-1 in the order given, and the listing follows', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Reverse', [0, 1, 2]);
    const r = await reorderSlots(fx.db, fx.actor, signupId, {
      slotIds: [idOf('c'), idOf('b'), idOf('a')],
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    // The result is the new order, with the numbers the slots ended up with.
    expect(r.value.map((s) => [what(s), s.sortOrder])).toEqual([
      ['c', 0],
      ['b', 1],
      ['a', 2],
    ]);
    expect(await shown(fx, signupId)).toEqual({
      names: ['c', 'b', 'a'],
      sortOrders: [0, 1, 2],
    });
  });

  it('works when every slot starts tied at 0', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Reorder tied', [0, 0, 0]);
    const r = await reorderSlots(fx.db, fx.actor, signupId, {
      slotIds: [idOf('c'), idOf('a'), idOf('b')],
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await shown(fx, signupId)).toEqual({
      names: ['c', 'a', 'b'],
      sortOrders: [0, 1, 2],
    });
  });

  it('closes the gaps when the starting orders are sparse', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Reorder sparse', [
      10,
      1_700_000_000,
      1_700_000_050,
    ]);
    const r = await reorderSlots(fx.db, fx.actor, signupId, {
      slotIds: [idOf('b'), idOf('c'), idOf('a')],
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await shown(fx, signupId)).toEqual({
      names: ['b', 'c', 'a'],
      sortOrders: [0, 1, 2],
    });
  });

  it('succeeds when the order already matches', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Reorder same', [0, 1, 2]);
    const r = await reorderSlots(fx.db, fx.actor, signupId, {
      slotIds: [idOf('a'), idOf('b'), idOf('c')],
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await shown(fx, signupId)).toEqual({
      names: ['a', 'b', 'c'],
      sortOrders: [0, 1, 2],
    });
  });

  it('refuses a list that is not exactly the slots of the signup, and writes nothing', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Reorder refused', [0, 5, 5]);
    const other = await makeSignup(fx, 'Reorder neighbour', [0]);
    const before = await shown(fx, signupId);
    const [a, b, c] = [idOf('a'), idOf('b'), idOf('c')];
    const foreign = other.idOf('a');
    const cases: { slotIds: string[]; details: Record<string, string[]> }[] = [
      { slotIds: [c, a], details: { missing: [b] } },
      { slotIds: [c, b, a, c], details: { duplicates: [c] } },
      { slotIds: [c, b, a, 'slot_nope'], details: { unknown: ['slot_nope'] } },
      { slotIds: [c, b, a, foreign], details: { unknown: [foreign] } },
      // Swapping one of its own for someone else's is both at once.
      { slotIds: [c, b, foreign], details: { missing: [a], unknown: [foreign] } },
    ];
    for (const { slotIds, details } of cases) {
      const r = await reorderSlots(fx.db, fx.actor, signupId, { slotIds });
      expect(r.ok, JSON.stringify(slotIds)).toBe(false);
      if (r.ok) return;
      expect(r.error).toMatchObject({ code: 'invalid_input', field: 'slotIds' });
      expect(r.error.details).toEqual(details);
      expect(r.error.suggestion).toContain('get_signup');
    }
    expect(await shown(fx, signupId)).toEqual(before);
    expect(await shown(fx, other.signupId)).toEqual({ names: ['a'], sortOrders: [0] });
    expect(await reorderEvents(signupId)).toHaveLength(0);
    expect(await reorderEvents(other.signupId)).toHaveLength(0);
  });

  it('refuses an empty list and a signup that does not exist', async () => {
    const { signupId } = await makeSignup(fx, 'Reorder empty', [0]);
    const empty = await reorderSlots(fx.db, fx.actor, signupId, { slotIds: [] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toMatchObject({ code: 'invalid_input', field: 'slotIds' });
    const gone = await reorderSlots(fx.db, fx.actor, 'sig_nope', { slotIds: ['slot_1'] });
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.code).toBe('not_found');
  });

  it('refuses a viewer', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Reorder viewer', [0, 1]);
    // requireWorkspaceWrite reads actor.workspaceRoles, so no member row is needed.
    const viewer: Actor = {
      kind: 'organizer',
      id: makeId('org'),
      email: 'viewer@example.test',
      workspaceIds: [fx.workspaceId],
      workspaceRoles: { [fx.workspaceId]: 'viewer' },
    };
    await expect(
      reorderSlots(fx.db, viewer, signupId, { slotIds: [idOf('b'), idOf('a')] }),
    ).rejects.toMatchObject({ serviceError: { code: 'forbidden' } });
    expect(await shown(fx, signupId)).toEqual({ names: ['a', 'b'], sortOrders: [0, 1] });
    expect(await reorderEvents(signupId)).toHaveLength(0);
  });

  it('does not deadlock with someone signing up for a slot that has to move', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Reorder commit race', [0, 1]);
    const at = { signupId, workspaceId: fx.workspaceId, slotId: idOf('a') };
    const r = await whileSigningUp(fx.db, at, () =>
      reorderSlots(fx.db, fx.actor, signupId, { slotIds: [idOf('b'), idOf('a')] }),
    );
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((await shown(fx, signupId)).names).toEqual(['b', 'a']);
  });

  it('waits for a delete in flight, then refuses the list that still names the slot', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Reorder delete race', [0, 1, 2]);
    const wanted = [idOf('c'), idOf('b'), idOf('a')];
    let moving: ReturnType<typeof reorderSlots> | undefined;
    await fx.db.transaction(async (tx) => {
      // What `deleteSlot` does, held open: it takes the slot row, not the signup.
      await tx.delete(slots).where(eq(slots.id, idOf('b')));
      moving = reorderSlots(fx.db, fx.actor, signupId, { slotIds: wanted });
      moving.catch(() => undefined);
      // Long enough for the reorder to read the slots. Reading without locking
      // the rows would still see `b`, accept the list, and record an order
      // that names a slot which no longer exists.
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const r = await moving!;
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatchObject({
        code: 'invalid_input',
        field: 'slotIds',
        details: { unknown: [idOf('b')] },
      });
    }
    expect(await shown(fx, signupId)).toEqual({ names: ['a', 'c'], sortOrders: [0, 2] });
    const acts = await fx.db.select().from(activity).where(eq(activity.signupId, signupId));
    expect(acts.filter((a) => a.eventType === 'slot.reordered')).toHaveLength(0);
  });

  it('records one slot.reordered row that carries the new order', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Reorder activity', [0, 1, 2]);
    const slotIds = [idOf('b'), idOf('a'), idOf('c')];
    const r = await reorderSlots(fx.db, fx.actor, signupId, { slotIds });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const events = await reorderEvents(signupId);
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ slotIds });
    expect(events[0]!.actorId).toBe(fx.organizerId);
  });

  it('a reorder and an append running at once leave no tied orders', async () => {
    const { signupId, idOf } = await makeSignup(fx, 'Reorder race', [0, 1, 2]);
    const [reordered, appended] = await Promise.all([
      reorderSlots(fx.db, fx.actor, signupId, { slotIds: [idOf('c'), idOf('b'), idOf('a')] }),
      addSlotsBulk(fx.db, fx.actor, signupId, { rows: [{ values: { what: 'end' } }] }),
    ]);
    // The append has nothing to be refused for, whoever takes the lock first.
    expect(appended.ok, JSON.stringify(appended)).toBe(true);
    if (!appended.ok) return;
    if (reordered.ok) {
      // The reorder went first, and the append landed after the new numbers.
      expect(await shown(fx, signupId)).toEqual({
        names: ['c', 'b', 'a', 'end'],
        sortOrders: [0, 1, 2, 3],
      });
    } else {
      // The append went first, so the reorder's list was one slot short.
      expect(reordered.error).toMatchObject({ code: 'invalid_input', field: 'slotIds' });
      expect(reordered.error.details).toEqual({ missing: [appended.value[0]!.id] });
      expect(await shown(fx, signupId)).toEqual({
        names: ['a', 'b', 'c', 'end'],
        sortOrders: [0, 1, 2, 3],
      });
      expect(await reorderEvents(signupId)).toHaveLength(0);
    }
  });
});
