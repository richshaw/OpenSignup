import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, deleteSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { GET as getActivity } from './activity/route';
import { GET as getExport } from './export.csv/route';
import { GET as getFields } from './fields/route';
import { GET as getSlots } from './slots/route';

// The routes read the organizer from the session cookie. Tests hand them one
// directly instead of going through Auth.js.
const session = vi.hoisted(() => ({ actor: { kind: 'anonymous' } as Actor }));
vi.mock('@/auth/session', () => ({ requireActor: async () => session.actor }));

type RouteGet = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

function call(route: RouteGet, signupId: string, path: string, query = '') {
  const req = new NextRequest(`http://localhost/api/signups/${signupId}/${path}${query}`);
  return route(req, { params: Promise.resolve({ id: signupId }) });
}

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  liveId: string;
  deletedId: string;
  participantEmail: string;
}

/** A published signup with one slot and one person signed up to it. */
async function signupWithCommitment(db: Db, actor: Actor, workspaceId: string, email: string) {
  const created = await createSignup(db, actor, workspaceId, {
    title: 'Deleted signup route test',
    description: '',
    tags: [],
    visibility: 'unlisted' as const,
    settings: {},
  });
  if (!created.ok) throw new Error(created.error.message);
  const slot = await addSlot(db, actor, created.value.id, { values: {}, capacity: 5 });
  if (!slot.ok) throw new Error(slot.error.message);
  const pub = await publishSignup(db, actor, created.value.id);
  if (!pub.ok) throw new Error(pub.error.message);
  const commit = await commitToSlot(db, slot.value.id, { name: 'Pat Example', email, quantity: 1 });
  if (!commit.ok) throw new Error(commit.error.message);
  return created.value.id;
}

async function setupFixture(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `ds-${workspaceId.slice(-8).toLowerCase()}`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email: `${slug}@example.test` });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Deleted Signup Route Test',
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

  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${slug}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  session.actor = actor;

  const participantEmail = `pat-${slug}@example.test`;
  const liveId = await signupWithCommitment(db, actor, workspaceId, participantEmail);
  const deletedId = await signupWithCommitment(db, actor, workspaceId, participantEmail);
  const deleted = await deleteSignup(db, actor, deletedId);
  if (!deleted.ok) throw new Error(deleted.error.message);

  return { db, workspaceId, organizerId, liveId, deletedId, participantEmail };
}

const ROUTES: Array<{ name: string; route: RouteGet; path: string }> = [
  { name: 'slots', route: getSlots, path: 'slots' },
  { name: 'fields', route: getFields, path: 'fields' },
  { name: 'activity', route: getActivity, path: 'activity' },
  { name: 'export.csv', route: getExport, path: 'export.csv' },
];

describe('/api/signups/[id] reads of a deleted signup (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupFixture();
  });

  afterAll(async () => {
    if (!fx) return; // setup failed: let its own error show
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it.each(ROUTES)('$name serves a live signup', async ({ route, path }) => {
    const res = await call(route, fx.liveId, path);
    expect(res.status).toBe(200);
  });

  it.each(ROUTES)('$name is not_found once the signup is deleted', async ({ route, path }) => {
    const res = await call(route, fx.deletedId, path);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });

  it('export.csv of a live signup carries the participant; of a deleted one, nothing', async () => {
    const live = await call(getExport, fx.liveId, 'export.csv');
    expect(await live.text()).toContain(fx.participantEmail);

    const gone = await call(getExport, fx.deletedId, 'export.csv');
    expect(await gone.text()).not.toContain(fx.participantEmail);
  });

  it('activity rounds a fractional limit down instead of failing', async () => {
    const res = await call(getActivity, fx.liveId, 'activity', '?limit=1.5');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});
