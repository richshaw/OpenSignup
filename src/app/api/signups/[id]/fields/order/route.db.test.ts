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
import { addField, listFieldsForSignup } from '@/services/slot-fields';
import { PUT } from './route';

// The route reads the organizer from the session cookie. Tests hand it one
// directly instead of going through Auth.js.
const session = vi.hoisted(() => ({ actor: { kind: 'anonymous' } as Actor }));
vi.mock('@/auth/session', () => ({ requireActor: async () => session.actor }));

function put(signupId: string, body: unknown) {
  const req = new NextRequest(`http://localhost/api/signups/${signupId}/fields/order`, {
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
  const slug = `fo-${workspaceId.slice(-8).toLowerCase()}`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email: `${slug}@example.test` });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Field Order Route Test',
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

/** A draft signup whose fields are, in order, the ones it starts with plus two more. */
async function signupWithFields(fx: Fixture) {
  const created = await createSignup(fx.db, fx.owner, fx.workspaceId, {
    title: 'Field order route test',
    description: '',
    tags: [],
    visibility: 'unlisted' as const,
    settings: {},
  });
  if (!created.ok) throw new Error(created.error.message);
  const signupId = created.value.id;
  for (const ref of ['extra-one', 'extra-two']) {
    const field = await addField(fx.db, fx.owner, signupId, {
      ref,
      label: ref,
      fieldType: 'text',
      config: { fieldType: 'text' },
    });
    if (!field.ok) throw new Error(field.error.message);
  }
  const ids = await order(fx, signupId);
  expect(ids.length).toBeGreaterThanOrEqual(2);
  return { signupId, ids };
}

async function order(fx: Fixture, signupId: string) {
  return (await listFieldsForSignup(fx.db, signupId)).map((f) => f.id);
}

describe('PUT /api/signups/[id]/fields/order (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupFixture();
  });

  afterAll(async () => {
    if (!fx) return; // setup failed: let its own error show
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it('puts the fields in the order given and returns them', async () => {
    session.actor = fx.owner;
    const { signupId, ids } = await signupWithFields(fx);
    const reversed = [...ids].reverse();

    const res = await put(signupId, { fieldIds: reversed });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string; sortOrder: number }> };
    expect(body.data.map((f) => [f.id, f.sortOrder])).toEqual(reversed.map((id, i) => [id, i]));
    expect(await order(fx, signupId)).toEqual(reversed);
  });

  it('refuses a list that leaves a field out, and changes nothing', async () => {
    session.actor = fx.owner;
    const { signupId, ids } = await signupWithFields(fx);

    const res = await put(signupId, { fieldIds: [...ids].reverse().slice(1) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_input');
    expect(await order(fx, signupId)).toEqual(ids);
  });

  it('asks a signed-out caller to sign in', async () => {
    session.actor = fx.owner;
    const { signupId, ids } = await signupWithFields(fx);

    session.actor = { kind: 'anonymous' };
    const res = await put(signupId, { fieldIds: [...ids].reverse() });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toEqual({ code: 'unauthorized', message: 'sign in required' });
    expect(await order(fx, signupId)).toEqual(ids);
  });

  it('refuses a viewer', async () => {
    session.actor = fx.owner;
    const { signupId, ids } = await signupWithFields(fx);

    session.actor = { ...fx.owner, workspaceRoles: { [fx.workspaceId]: 'viewer' } } as Actor;
    const res = await put(signupId, { fieldIds: [...ids].reverse() });
    expect(res.status).toBe(403);
    expect(await order(fx, signupId)).toEqual(ids);
  });

  it('is not_found for a deleted signup', async () => {
    session.actor = fx.owner;
    const { signupId, ids } = await signupWithFields(fx);
    const deleted = await deleteSignup(fx.db, fx.owner, signupId);
    if (!deleted.ok) throw new Error(deleted.error.message);

    const res = await put(signupId, { fieldIds: [...ids].reverse() });
    expect(res.status).toBe(404);
  });
});
