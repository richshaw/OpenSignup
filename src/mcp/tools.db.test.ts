import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import { commitToSlot } from '@/services/commitments';
import { createSignup, getPublicSignup, publishSignup } from '@/services/signups';
import type { ToolContext } from './context';
import { buildInstructions } from './instructions';
import { connectTestClient } from './testing/client';
import { contextForOrganizer } from './testing/context';
import { TOOLS } from './tools';

const db = getDb();
const CLIENT = 'https://assistant.example/oauth/metadata.json';
let organizerId: string;
let workspaceId: string;
let ctx: ToolContext;
let viewerId: string;
let viewerCtx: ToolContext;

beforeAll(async () => {
  organizerId = makeId('org');
  workspaceId = makeId('ws');
  await db.insert(organizers).values({
    id: organizerId,
    email: `${organizerId}@example.com`,
    defaultWorkspaceId: workspaceId,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    slug: organizerId.toLowerCase(),
    name: 'Tools',
    type: 'personal',
    plan: 'free',
  });
  await db.insert(workspaceMembers).values({
    id: makeId('mem'),
    workspaceId,
    organizerId,
    role: 'owner',
    status: 'active',
  });
  ctx = await contextForOrganizer(db, organizerId, CLIENT);

  viewerId = makeId('org');
  await db.insert(organizers).values({
    id: viewerId,
    email: `${viewerId}@example.com`,
    defaultWorkspaceId: workspaceId,
  });
  await db.insert(workspaceMembers).values({
    id: makeId('mem'),
    workspaceId,
    organizerId: viewerId,
    role: 'viewer',
    status: 'active',
  });
  viewerCtx = await contextForOrganizer(db, viewerId, CLIENT);
});

afterAll(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(organizers).where(eq(organizers.id, organizerId));
  await db.delete(organizers).where(eq(organizers.id, viewerId));
});

describe('server instructions', () => {
  it('reach a connected client, built from the full tool list', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    expect(client.getInstructions()).toBe(buildInstructions(TOOLS));
  });
});

describe('read tools on Postgres', () => {
  it('get_signup filled counts agree with the public page and never leak participants', async () => {
    const created = await createSignup(db, ctx.actor, workspaceId, { title: 'Snack rota' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await publishSignup(db, ctx.actor, created.value.id);
    const pub = await getPublicSignup(db, created.value.slug);
    expect(pub.ok).toBe(true);
    if (!pub.ok) return;
    const slotId = pub.value.slots[0]!.id;
    const commit = await commitToSlot(db, slotId, { name: 'Pat', email: 'pat@example.com' });
    expect(commit.ok, JSON.stringify(commit)).toBe(true);

    const client = await connectTestClient(ctx, TOOLS);
    const r = await client.callTool({ name: 'get_signup', arguments: { signupId: created.value.id } });
    expect(r.isError, JSON.stringify(r.structuredContent)).toBeFalsy();
    const body = r.structuredContent as { slots: { id: string; filled: number }[] };
    const again = await getPublicSignup(db, created.value.slug);
    expect(body.slots[0]).toMatchObject({
      id: slotId,
      filled: again.ok ? again.value.committedBySlot[slotId] : -1,
    });
    expect(body.slots[0]!.filled).toBe(1);
    expect(JSON.stringify(body)).not.toContain('pat@example.com');
    expect(JSON.stringify(body)).not.toContain('Pat');
  });

  it('list_signups sees the workspace and a foreign workspace is forbidden', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const mine = await client.callTool({ name: 'list_signups', arguments: {} });
    expect((mine.structuredContent as { signups: unknown[] }).signups.length).toBeGreaterThan(0);
    const other = await client.callTool({ name: 'list_signups', arguments: { workspaceId: makeId('ws') } });
    expect(other.isError).toBe(true);
    expect((other.structuredContent as { error: { code: string } }).error.code).toBe('forbidden');
  });
});

describe('signup write tools on Postgres', () => {
  it('create_signup writes signup, fields, slots, and an attributed activity row in one call', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const r = await client.callTool({
      name: 'create_signup',
      arguments: {
        title: 'Saturday snacks',
        fields: [
          { ref: 'date', label: 'Date', fieldType: 'date' },
          { ref: 'what', label: 'What', fieldType: 'text' },
        ],
        slots: [
          { values: { date: '2026-10-03', what: 'Fruit' }, capacity: 2 },
          { values: { date: '2026-10-10', what: 'Crackers' }, capacity: 2 },
        ],
      },
    });
    expect(r.isError, JSON.stringify(r.structuredContent)).toBeFalsy();
    const body = r.structuredContent as {
      signup: { id: string };
      fields: { id: string; ref: string }[];
      slots: { id: string; values: Record<string, unknown>; filled: number }[];
    };
    expect(body).not.toHaveProperty('summary');
    expect(body.fields.map((f) => f.ref)).toEqual(['date', 'what']);
    expect(body.slots.map((s) => s.values.what)).toEqual(['Fruit', 'Crackers']);
    expect(body.slots.every((s) => s.id.startsWith('slot_') && s.filled === 0)).toBe(true);
    // Same ids, same order, same shape as a read straight afterwards.
    const detail = await client.callTool({ name: 'get_signup', arguments: { signupId: body.signup.id } });
    const d = detail.structuredContent as { fields: unknown[]; slots: unknown[] };
    expect(d.fields).toEqual(body.fields);
    expect(d.slots).toEqual(body.slots);
    const [act] = await db
      .select()
      .from(activity)
      .where(and(eq(activity.signupId, body.signup.id), eq(activity.eventType, 'signup.created')));
    expect(act?.payload).toMatchObject({ templateId: 'mcp', viaClientId: CLIENT });
  });

  it('a viewer can read but not write', async () => {
    const client = await connectTestClient(viewerCtx, TOOLS);
    const list = await client.callTool({ name: 'list_signups', arguments: {} });
    expect(list.isError, JSON.stringify(list.structuredContent)).toBeFalsy();
    const r = await client.callTool({
      name: 'create_signup',
      arguments: { title: 'Nope nope', fields: [{ ref: 'a', label: 'A', fieldType: 'text' }], slots: [{}] },
    });
    expect(r.isError).toBe(true);
    expect((r.structuredContent as { error: { code: string } }).error.code).toBe('forbidden');
  });

  it('publish then close, and a second publish is a conflict', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const created = await client.callTool({
      name: 'create_signup',
      arguments: { title: 'Lifecycle', fields: [{ ref: 'a', label: 'A', fieldType: 'text' }], slots: [{ values: { a: 'x' } }] },
    });
    const id = (created.structuredContent as { signup: { id: string } }).signup.id;
    const published = await client.callTool({ name: 'publish_signup', arguments: { signupId: id } });
    expect((published.structuredContent as { signup: { status: string } }).signup.status).toBe('open');
    const again = await client.callTool({ name: 'publish_signup', arguments: { signupId: id } });
    expect((again.structuredContent as { error: { code: string } }).error.code).toBe('conflict');
    const closed = await client.callTool({ name: 'close_signup', arguments: { signupId: id } });
    expect((closed.structuredContent as { signup: { status: string } }).signup.status).toBe('closed');
  });

  it('create_signup refuses a value that does not fit and writes nothing', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const before = (await client.callTool({ name: 'list_signups', arguments: {} })).structuredContent as { signups: unknown[] };
    const r = await client.callTool({
      name: 'create_signup',
      arguments: { title: 'Bad date', fields: [{ ref: 'date', label: 'Date', fieldType: 'date' }], slots: [{ values: { date: '3 October' } }] },
    });
    expect((r.structuredContent as { error: { code: string } }).error.code).toBe('invalid_input');
    const after = (await client.callTool({ name: 'list_signups', arguments: {} })).structuredContent as { signups: unknown[] };
    expect(after.signups).toHaveLength(before.signups.length);
  });

  it('a deleted signup cannot be updated or published', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const created = await client.callTool({
      name: 'create_signup',
      arguments: { title: 'Gone soon', fields: [{ ref: 'a', label: 'A', fieldType: 'text' }], slots: [{ values: { a: 'x' } }] },
    });
    const id = (created.structuredContent as { signup: { id: string } }).signup.id;
    await client.callTool({ name: 'delete_signup', arguments: { signupId: id } });
    const upd = await client.callTool({ name: 'update_signup', arguments: { signupId: id, title: 'Renamed' } });
    expect((upd.structuredContent as { error: { code: string } }).error.code).toBe('not_found');
    const pub = await client.callTool({ name: 'publish_signup', arguments: { signupId: id } });
    expect((pub.structuredContent as { error: { code: string } }).error.code).toBe('not_found');
  });

  it('update_signup changes one setting and keeps the rest', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const created = await client.callTool({
      name: 'create_signup',
      arguments: {
        title: 'Settings merge',
        fields: [{ ref: 'day', label: 'Day', fieldType: 'enum', choices: ['Sat', 'Sun'] }],
        slots: [{ values: { day: 'Sat' } }, { values: { day: 'Sat' } }, { values: { day: 'Sun' } }],
        groupBy: 'day',
      },
    });
    const c = created.structuredContent as { signup: { id: string; settings: Record<string, unknown> } };
    expect(c.signup.settings.groupByFieldRefs).toEqual(['day']);
    const updated = await client.callTool({
      name: 'update_signup',
      arguments: { signupId: c.signup.id, settings: { sendReminders: false } },
    });
    expect(updated.isError, JSON.stringify(updated.structuredContent)).toBeFalsy();
    const u = updated.structuredContent as { signup: { settings: Record<string, unknown> } };
    expect(u.signup.settings).toMatchObject({ sendReminders: false, groupByFieldRefs: ['day'] });

    // A cap can be set, then cleared with null; the closing time likewise.
    const capped = await client.callTool({
      name: 'update_signup',
      arguments: { signupId: c.signup.id, settings: { maxCommitmentsPerParticipant: 2 }, closesAt: '2026-12-01T00:00:00.000Z' },
    });
    const cs = capped.structuredContent as { signup: { settings: Record<string, unknown>; closesAt: string | null } };
    expect(cs.signup.settings.maxCommitmentsPerParticipant).toBe(2);
    expect(cs.signup.closesAt).toBe('2026-12-01T00:00:00.000Z');
    const cleared = await client.callTool({
      name: 'update_signup',
      arguments: { signupId: c.signup.id, settings: { maxCommitmentsPerParticipant: null }, closesAt: null },
    });
    const cl = cleared.structuredContent as { signup: { settings: Record<string, unknown>; closesAt: string | null } };
    expect(cl.signup.settings).not.toHaveProperty('maxCommitmentsPerParticipant');
    expect(cl.signup.settings).toMatchObject({ sendReminders: false, groupByFieldRefs: ['day'] });
    expect(cl.signup.closesAt).toBeNull();
  });
});

describe('field and slot tools on Postgres', () => {
  async function createVia(client: Awaited<ReturnType<typeof connectTestClient>>, title: string) {
    const created = await client.callTool({
      name: 'create_signup',
      arguments: { title, fields: [{ ref: 'what', label: 'What', fieldType: 'text' }], slots: [{ values: { what: 'Fruit' } }] },
    });
    expect(created.isError, JSON.stringify(created.structuredContent)).toBeFalsy();
    return (created.structuredContent as { signup: { id: string } }).signup.id;
  }

  it('add_field, add_slots, update_slot, delete_slot round-trip and get_signup follows', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const id = await createVia(client, 'Fields and slots');
    const f = await client.callTool({ name: 'add_field', arguments: { signupId: id, ref: 'date', label: 'Date', fieldType: 'date' } });
    expect(f.isError, JSON.stringify(f.structuredContent)).toBeFalsy();
    const bad = await client.callTool({ name: 'update_field', arguments: { fieldId: (f.structuredContent as { field: { id: string } }).field.id, fieldType: 'number', config: { fieldType: 'text', maxLength: 5 } } });
    expect((bad.structuredContent as { error: { code: string } }).error.code).toBe('invalid_input');
    const added = await client.callTool({
      name: 'add_slots',
      arguments: { signupId: id, rows: [{ values: { what: 'Crackers', date: '2026-10-10' }, capacity: 3 }, { values: { what: 'Juice' } }] },
    });
    expect(added.isError, JSON.stringify(added.structuredContent)).toBeFalsy();
    const rows = (added.structuredContent as { slots: { id: string; capacity: number | null; sortOrder: number }[] }).slots;
    // Appended after the template's slot 0, in order, and capacity defaults to 1.
    expect(rows.map((r) => r.sortOrder)).toEqual([1, 2]);
    expect(rows[1]!.capacity).toBe(1);
    const upd = await client.callTool({ name: 'update_slot', arguments: { slotId: rows[0]!.id, capacity: 5 } });
    expect((upd.structuredContent as { slot: { capacity: number } }).slot.capacity).toBe(5);
    const del = await client.callTool({ name: 'delete_slot', arguments: { slotId: rows[0]!.id } });
    expect(del.structuredContent).toEqual({ deleted: true, commitmentsRemoved: 0 });
    const detail = await client.callTool({ name: 'get_signup', arguments: { signupId: id } });
    const d = detail.structuredContent as { slots: { sortOrder: number }[]; fields: unknown[] };
    expect(d.slots.map((s) => s.sortOrder)).toEqual([0, 2]);
    expect(d.fields).toHaveLength(2);
  });

  it('add_slots with beforeSlotId puts the new slot first, and get_signup agrees', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const created = await client.callTool({
      name: 'create_signup',
      arguments: {
        title: 'Insert before',
        fields: [{ ref: 'what', label: 'What', fieldType: 'text' }],
        slots: [{ values: { what: 'a' } }, { values: { what: 'b' } }, { values: { what: 'c' } }],
      },
    });
    expect(created.isError, JSON.stringify(created.structuredContent)).toBeFalsy();
    type Shown = { id: string; values: { what: string }; sortOrder: number };
    const c = created.structuredContent as { signup: { id: string }; slots: Shown[] };
    const added = await client.callTool({
      name: 'add_slots',
      arguments: {
        signupId: c.signup.id,
        beforeSlotId: c.slots[0]!.id,
        rows: [{ values: { what: 'new' } }],
      },
    });
    expect(added.isError, JSON.stringify(added.structuredContent)).toBeFalsy();
    expect((added.structuredContent as { slots: Shown[] }).slots[0]!.sortOrder).toBe(0);
    const detail = await client.callTool({
      name: 'get_signup',
      arguments: { signupId: c.signup.id },
    });
    const d = detail.structuredContent as { slots: Shown[] };
    expect(d.slots.map((s) => s.values.what)).toEqual(['new', 'a', 'b', 'c']);
    expect(d.slots.map((s) => s.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it('reorder_slots reverses the slots, and a partial list changes nothing', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const created = await client.callTool({
      name: 'create_signup',
      arguments: {
        title: 'Reorder',
        fields: [{ ref: 'what', label: 'What', fieldType: 'text' }],
        slots: [{ values: { what: 'a' } }, { values: { what: 'b' } }, { values: { what: 'c' } }],
      },
    });
    expect(created.isError, JSON.stringify(created.structuredContent)).toBeFalsy();
    type Shown = { id: string; values: { what: string }; sortOrder: number };
    const c = created.structuredContent as { signup: { id: string }; slots: Shown[] };
    const reversed = c.slots.map((s) => s.id).reverse();
    const moved = await client.callTool({
      name: 'reorder_slots',
      arguments: { signupId: c.signup.id, slotIds: reversed },
    });
    expect(moved.isError, JSON.stringify(moved.structuredContent)).toBeFalsy();
    const m = moved.structuredContent as { slots: Shown[] };
    expect(m.slots.map((s) => s.id)).toEqual(reversed);

    const partial = await client.callTool({
      name: 'reorder_slots',
      arguments: { signupId: c.signup.id, slotIds: reversed.slice(1) },
    });
    expect(partial.isError).toBe(true);
    expect(partial.structuredContent).toMatchObject({
      error: { code: 'invalid_input', field: 'slotIds', details: { missing: [reversed[0]] } },
    });

    const detail = await client.callTool({
      name: 'get_signup',
      arguments: { signupId: c.signup.id },
    });
    const d = detail.structuredContent as { slots: Shown[] };
    expect(d.slots.map((s) => s.values.what)).toEqual(['c', 'b', 'a']);
    expect(d.slots.map((s) => s.sortOrder)).toEqual([0, 1, 2]);
  });

  it('update_slot refuses a sortOrder, names reorder_slots, and the order stays put', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const created = await client.callTool({
      name: 'create_signup',
      arguments: {
        title: 'No single numbers',
        fields: [{ ref: 'what', label: 'What', fieldType: 'text' }],
        slots: [{ values: { what: 'a' } }, { values: { what: 'b' } }],
      },
    });
    expect(created.isError, JSON.stringify(created.structuredContent)).toBeFalsy();
    type Shown = { id: string; values: { what: string }; sortOrder: number };
    const c = created.structuredContent as { signup: { id: string }; slots: Shown[] };

    const r = await client.callTool({
      name: 'update_slot',
      arguments: { slotId: c.slots[1]!.id, sortOrder: 0 },
    });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({ error: { code: 'invalid_input' } });
    expect(JSON.stringify(r.structuredContent)).toContain('reorder_slots');

    const detail = await client.callTool({
      name: 'get_signup',
      arguments: { signupId: c.signup.id },
    });
    const d = detail.structuredContent as { slots: Shown[] };
    expect(d.slots.map((s) => [s.values.what, s.sortOrder])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });

  it('a viewer cannot add slots', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const id = await createVia(client, 'Viewer check');
    const viewer = await connectTestClient(viewerCtx, TOOLS);
    const r = await viewer.callTool({ name: 'add_slots', arguments: { signupId: id, rows: [{ values: { what: 'y' } }] } });
    expect(r.isError).toBe(true);
    expect((r.structuredContent as { error: { code: string } }).error.code).toBe('forbidden');
  });

  it('delete_slot refuses a slot someone committed to until forced, then reports the loss', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const id = await createVia(client, 'Orphan check');
    await client.callTool({ name: 'publish_signup', arguments: { signupId: id } });
    const detail = await client.callTool({ name: 'get_signup', arguments: { signupId: id } });
    const slotId = (detail.structuredContent as { slots: { id: string }[] }).slots[0]!.id;
    const commit = await commitToSlot(db, slotId, { name: 'Sam', email: 'sam@example.com' });
    expect(commit.ok).toBe(true);
    const refused = await client.callTool({ name: 'delete_slot', arguments: { slotId } });
    expect((refused.structuredContent as { error: { code: string; details: { filled: number } } }).error).toMatchObject({ code: 'conflict', details: { filled: 1 } });
    expect(await db.select({ id: commitments.id }).from(commitments).where(eq(commitments.slotId, slotId))).toHaveLength(1);
    const forced = await client.callTool({ name: 'delete_slot', arguments: { slotId, force: true } });
    expect(forced.structuredContent).toEqual({ deleted: true, commitmentsRemoved: 1 });
    // The slot foreign key cascades, so the commitment goes with the slot. Pre-existing; asserted here.
    expect(await db.select({ id: commitments.id }).from(commitments).where(eq(commitments.slotId, slotId))).toHaveLength(0);
  });

  it('delete_slot counts the places taken, not the number of commitments', async () => {
    // One commitment can reserve several places. Counting rows understated
    // what the organizer is about to take away.
    const client = await connectTestClient(ctx, TOOLS);
    const id = await createVia(client, 'Quantity check');
    await client.callTool({ name: 'publish_signup', arguments: { signupId: id } });
    const added = await client.callTool({
      name: 'add_slots',
      arguments: { signupId: id, rows: [{ values: { what: 'Bulk buy' }, capacity: 5 }] },
    });
    const slotId = (added.structuredContent as { slots: { id: string }[] }).slots[0]!.id;
    const commit = await commitToSlot(db, slotId, {
      name: 'Sam',
      email: 'sam@example.com',
      quantity: 3,
    });
    expect(commit.ok, JSON.stringify(commit)).toBe(true);

    const refused = await client.callTool({ name: 'delete_slot', arguments: { slotId } });
    const error = (refused.structuredContent as {
      error: { code: string; message: string; details: { filled: number; commitments: number } };
    }).error;
    expect(error).toMatchObject({ code: 'conflict', details: { filled: 3, commitments: 1 } });
    expect(error.message).toContain('3 people have');

    const forced = await client.callTool({ name: 'delete_slot', arguments: { slotId, force: true } });
    expect(forced.structuredContent).toEqual({ deleted: true, commitmentsRemoved: 1 });
  });

  it('every row the client wrote for a signup is attributed to the connected app', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const id = await createVia(client, 'Attribution');
    const f = await client.callTool({ name: 'add_field', arguments: { signupId: id, ref: 'n', label: 'N', fieldType: 'number' } });
    const fieldId = (f.structuredContent as { field: { id: string } }).field.id;
    await client.callTool({ name: 'update_field', arguments: { fieldId, label: 'Number' } });
    const added = await client.callTool({ name: 'add_slots', arguments: { signupId: id, rows: [{ values: { what: 'x', n: 2 } }] } });
    const slotId = (added.structuredContent as { slots: { id: string }[] }).slots[0]!.id;
    await client.callTool({ name: 'update_slot', arguments: { slotId, capacity: 2 } });
    await client.callTool({ name: 'delete_slot', arguments: { slotId } });
    await client.callTool({ name: 'delete_field', arguments: { fieldId } });
    await client.callTool({ name: 'publish_signup', arguments: { signupId: id } });
    const rows = await db
      .select({ eventType: activity.eventType, actorType: activity.actorType, payload: activity.payload })
      .from(activity)
      .where(eq(activity.signupId, id));
    const organizerRows = rows.filter((r) => r.actorType === 'organizer');
    expect(organizerRows.map((r) => r.eventType).sort()).toEqual(
      ['field.created', 'field.deleted', 'field.updated', 'signup.created', 'signup.published', 'slot.created', 'slot.deleted', 'slot.updated'].sort(),
    );
    for (const r of organizerRows) expect(r.payload, r.eventType).toMatchObject({ viaClientId: CLIENT });
    expect(rows.find((r) => r.eventType === 'slot.created')?.payload).toMatchObject({ slotIds: [slotId] });
  });
});
