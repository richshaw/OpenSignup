import { and, eq, inArray } from 'drizzle-orm';
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
    const body = r.structuredContent as { signup: { id: string } };
    const detail = await client.callTool({ name: 'get_signup', arguments: { signupId: body.signup.id } });
    const d = detail.structuredContent as { fields: unknown[]; slots: unknown[] };
    expect(d.fields).toHaveLength(2);
    expect(d.slots).toHaveLength(2);
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
  it('add_field, add_slots, update_slot, delete_slot round-trip and get_signup follows', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const created = await client.callTool({
      name: 'create_signup',
      arguments: { title: 'Fields and slots', fields: [{ ref: 'what', label: 'What', fieldType: 'text' }], slots: [{ values: { what: 'Fruit' } }] },
    });
    const id = (created.structuredContent as { signup: { id: string } }).signup.id;
    const f = await client.callTool({
      name: 'add_field',
      arguments: { signupId: id, ref: 'date', label: 'Date', fieldType: 'date', config: { fieldType: 'date' } },
    });
    expect(f.isError, JSON.stringify(f.structuredContent)).toBeFalsy();
    const bad = await client.callTool({
      name: 'add_field',
      arguments: { signupId: id, ref: 'n', label: 'N', fieldType: 'number', config: { fieldType: 'text', maxLength: 5 } },
    });
    expect((bad.structuredContent as { error: { code: string } }).error.code).toBe('invalid_input');
    const added = await client.callTool({
      name: 'add_slots',
      arguments: { signupId: id, rows: [{ values: { what: 'Crackers', date: '2026-10-10' }, capacity: 3 }] },
    });
    expect(added.isError, JSON.stringify(added.structuredContent)).toBeFalsy();
    const slotId = (added.structuredContent as { slots: { id: string }[] }).slots[0]!.id;
    const upd = await client.callTool({ name: 'update_slot', arguments: { slotId, capacity: 5 } });
    expect((upd.structuredContent as { slot: { capacity: number } }).slot.capacity).toBe(5);
    const del = await client.callTool({ name: 'delete_slot', arguments: { slotId } });
    expect(del.structuredContent).toEqual({ deleted: true });
    const detail = await client.callTool({ name: 'get_signup', arguments: { signupId: id } });
    const d = detail.structuredContent as { slots: unknown[]; fields: unknown[] };
    expect(d.slots).toHaveLength(1);
    expect(d.fields).toHaveLength(2);
  });

  it('a viewer cannot add slots', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const created = await client.callTool({
      name: 'create_signup',
      arguments: { title: 'Viewer check', fields: [{ ref: 'a', label: 'A', fieldType: 'text' }], slots: [{ values: { a: 'x' } }] },
    });
    const id = (created.structuredContent as { signup: { id: string } }).signup.id;
    const viewer = await connectTestClient(viewerCtx, TOOLS);
    const r = await viewer.callTool({ name: 'add_slots', arguments: { signupId: id, rows: [{ values: { a: 'y' } }] } });
    expect(r.isError).toBe(true);
    expect((r.structuredContent as { error: { code: string } }).error.code).toBe('forbidden');
  });

  it('deleting a slot someone committed to succeeds and removes the commitment with it, as in the browser', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const created = await client.callTool({
      name: 'create_signup',
      arguments: { title: 'Orphan check', fields: [{ ref: 'a', label: 'A', fieldType: 'text' }], slots: [{ values: { a: 'x' } }] },
    });
    const id = (created.structuredContent as { signup: { id: string } }).signup.id;
    await client.callTool({ name: 'publish_signup', arguments: { signupId: id } });
    const detail = await client.callTool({ name: 'get_signup', arguments: { signupId: id } });
    const slotId = (detail.structuredContent as { slots: { id: string }[] }).slots[0]!.id;
    const commit = await commitToSlot(db, slotId, { name: 'Sam', email: 'sam@example.com' });
    expect(commit.ok).toBe(true);
    const before = await client.callTool({ name: 'get_signup', arguments: { signupId: id } });
    expect((before.structuredContent as { slots: { filled: number }[] }).slots[0]!.filled).toBe(1);
    const del = await client.callTool({ name: 'delete_slot', arguments: { slotId } });
    expect(del.structuredContent).toEqual({ deleted: true });
    // `deleteSlot` marks commitments orphaned and then deletes the slot; the
    // slot foreign key cascades, so the row is gone. Asserted, not changed.
    const rows = await db.select({ status: commitments.status }).from(commitments).where(eq(commitments.slotId, slotId));
    expect(rows).toHaveLength(0);
  });

  it('every row the client wrote is attributed to the connected app', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const mine = await client.callTool({ name: 'list_signups', arguments: {} });
    const ids = (mine.structuredContent as { signups: { id: string }[] }).signups.map((s) => s.id);
    const rows = await db
      .select({ payload: activity.payload, eventType: activity.eventType })
      .from(activity)
      .where(inArray(activity.signupId, ids));
    const organizerRows = rows.filter((r) => /^(signup|slot|field)\./.test(r.eventType));
    expect(organizerRows.length).toBeGreaterThan(8);
    for (const r of organizerRows) expect(r.payload, r.eventType).toMatchObject({ viaClientId: CLIENT });
  });
});
