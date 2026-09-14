import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import { commitToSlot } from '@/services/commitments';
import { createSignup, getPublicSignup, publishSignup } from '@/services/signups';
import type { ToolContext } from './context';
import { connectTestClient } from './testing/client';
import { contextForOrganizer } from './testing/context';

const db = getDb();
const CLIENT = 'https://assistant.example/oauth/metadata.json';
let organizerId: string;
let workspaceId: string;
let ctx: ToolContext;

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
});

afterAll(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(organizers).where(eq(organizers.id, organizerId));
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

    const client = await connectTestClient(ctx);
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
    const client = await connectTestClient(ctx);
    const mine = await client.callTool({ name: 'list_signups', arguments: {} });
    expect((mine.structuredContent as { signups: unknown[] }).signups.length).toBeGreaterThan(0);
    const other = await client.callTool({ name: 'list_signups', arguments: { workspaceId: makeId('ws') } });
    expect(other.isError).toBe(true);
    expect((other.structuredContent as { error: { code: string } }).error.code).toBe('forbidden');
  });
});
