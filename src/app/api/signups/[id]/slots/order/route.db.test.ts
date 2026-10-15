import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { createSignup, deleteSignup } from '@/services/signups';
import { addSlot, listSlotsForSignup } from '@/services/slots';
import { PUT } from './route';

// The route reads the organizer from the session cookie. Tests hand it one
// directly instead of going through Auth.js.
const session = vi.hoisted(() => ({ actor: { kind: 'anonymous' } as Actor }));
vi.mock('@/auth/session', () => ({ requireActor: async () => session.actor }));

function put(signupId: string, body: unknown) {
  const req = new NextRequest(`http://localhost/api/signups/${signupId}/slots/order`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PUT(req, { params: Promise.resolve({ id: signupId }) });
}

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  owner: Actor;
}

async function setupFixture(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `ro-${workspaceId.slice(-8).toLowerCase()}`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email: `${slug}@example.test` });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Slot Order Route Test',
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

  const owner: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${slug}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  return { db, workspaceId, organizerId, owner };
}

/** A draft signup with three slots, a, b and c, in that order. */
async function signupWithSlots(fx: Fixture) {
  const created = await createSignup(fx.db, fx.owner, fx.workspaceId, {
    title: 'Slot order route test',
    description: '',
    tags: [],
    visibility: 'unlisted' as const,
    settings: {},
  });
  if (!created.ok) throw new Error(created.error.message);
  const signupId = created.value.id;
  // A new signup starts with one blank slot; add two more.
  for (let i = 0; i < 2; i++) {
    const slot = await addSlot(fx.db, fx.owner, signupId, { values: {} });
    if (!slot.ok) throw new Error(slot.error.message);
  }
  const ids = await order(fx, signupId);
  expect(ids).toHaveLength(3);
  const [a, b, c] = ids as [string, string, string];
  return { signupId, a, b, c };
}

async function order(fx: Fixture, signupId: string) {
  return (await listSlotsForSignup(fx.db, signupId)).map((s) => s.id);
}

describe('PUT /api/signups/[id]/slots/order (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupFixture();
  });

  afterAll(async () => {
    if (!fx) return; // setup failed: let its own error show
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it('puts the slots in the order given and returns them', async () => {
    session.actor = fx.owner;
    const { signupId, a, b, c } = await signupWithSlots(fx);

    const res = await put(signupId, { slotIds: [c, a, b] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string; sortOrder: number }> };
    expect(body.data.map((s) => [s.id, s.sortOrder])).toEqual([
      [c, 0],
      [a, 1],
      [b, 2],
    ]);
    expect(await order(fx, signupId)).toEqual([c, a, b]);
  });

  it('refuses a list that leaves a slot out, and changes nothing', async () => {
    session.actor = fx.owner;
    const { signupId, a, b, c } = await signupWithSlots(fx);

    const res = await put(signupId, { slotIds: [b, a] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_input');
    expect(await order(fx, signupId)).toEqual([a, b, c]);
  });

  it('asks a signed-out caller to sign in', async () => {
    session.actor = fx.owner;
    const { signupId, a, b, c } = await signupWithSlots(fx);

    session.actor = { kind: 'anonymous' };
    const res = await put(signupId, { slotIds: [c, b, a] });
    expect(res.status).toBe(401);
    expect(await order(fx, signupId)).toEqual([a, b, c]);
  });

  it('refuses a viewer', async () => {
    session.actor = fx.owner;
    const { signupId, a, b, c } = await signupWithSlots(fx);

    session.actor = { ...fx.owner, workspaceRoles: { [fx.workspaceId]: 'viewer' } } as Actor;
    const res = await put(signupId, { slotIds: [c, b, a] });
    expect(res.status).toBe(403);
    expect(await order(fx, signupId)).toEqual([a, b, c]);
  });

  it('is not_found for a deleted signup', async () => {
    session.actor = fx.owner;
    const { signupId, a, b, c } = await signupWithSlots(fx);
    const deleted = await deleteSignup(fx.db, fx.owner, signupId);
    if (!deleted.ok) throw new Error(deleted.error.message);

    const res = await put(signupId, { slotIds: [c, b, a] });
    expect(res.status).toBe(404);
  });
});
