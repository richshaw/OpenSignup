import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { rateLimits } from '@/db/schema/rate-limits';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { RateLimits } from '@/lib/rate-limit';
import { POST } from './route';

// The session is stubbed; the route, policy, rate limit and database are real.
const route = vi.hoisted(() => ({ actor: undefined as unknown, defaultWorkspaceId: '' }));
vi.mock('@/auth/session', () => ({
  requireActor: async () => route.actor,
  getOrganizerSession: async () => ({ defaultWorkspaceId: route.defaultWorkspaceId }),
}));

const BUCKET = RateLimits.signupCreatePerOrganizer.bucket;

describe('POST /api/signups create quota (db)', () => {
  const db: Db = getDb();
  const ownerId = makeId('org');
  const callerId = makeId('org');
  const sharedWs = makeId('ws');
  const callerWs = makeId('ws');
  const foreignWs = makeId('ws');
  const caller: Actor = {
    kind: 'organizer',
    id: callerId,
    email: 'pat@example.com',
    workspaceIds: [callerWs, sharedWs],
    workspaceRoles: { [callerWs]: 'owner', [sharedWs]: 'viewer' },
  };

  beforeAll(async () => {
    await db.transaction(async (tx) => {
      await tx.insert(organizers).values([
        { id: ownerId, email: `${ownerId.toLowerCase()}@example.test`, name: 'Owner' },
        { id: callerId, email: `${callerId.toLowerCase()}@example.test`, name: 'Pat' },
      ]);
      await tx.insert(workspaces).values(
        [sharedWs, callerWs, foreignWs].map((id) => ({
          id,
          slug: `quota-${id.slice(-10).toLowerCase()}`,
          name: 'Quota test',
          type: 'personal' as const,
          plan: 'free' as const,
        })),
      );
      await tx.insert(workspaceMembers).values([
        {
          id: makeId('mem'),
          workspaceId: sharedWs,
          organizerId: ownerId,
          role: 'owner',
          status: 'active',
        },
        {
          id: makeId('mem'),
          workspaceId: foreignWs,
          organizerId: ownerId,
          role: 'owner',
          status: 'active',
        },
        {
          id: makeId('mem'),
          workspaceId: sharedWs,
          organizerId: callerId,
          role: 'viewer',
          status: 'active',
        },
        {
          id: makeId('mem'),
          workspaceId: callerWs,
          organizerId: callerId,
          role: 'owner',
          status: 'active',
        },
      ]);
    });
  });

  beforeEach(() => {
    route.actor = caller;
    route.defaultWorkspaceId = callerWs;
  });

  afterAll(async () => {
    await db.delete(rateLimits).where(eq(rateLimits.subject, callerId));
    await db.delete(workspaces).where(inArray(workspaces.id, [sharedWs, callerWs, foreignWs]));
    await db.delete(organizers).where(inArray(organizers.id, [ownerId, callerId]));
  });

  async function charged(): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`coalesce(sum(${rateLimits.count}), 0)::int` })
      .from(rateLimits)
      .where(and(eq(rateLimits.bucket, BUCKET), eq(rateLimits.subject, callerId)));
    return row?.n ?? 0;
  }

  function create(body: Record<string, unknown>) {
    return POST(
      new NextRequest('http://localhost/api/signups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Snack duty', ...body }),
      }),
      { params: Promise.resolve({}) },
    );
  }

  it('refuses a viewer of the workspace without charging the create quota', async () => {
    const before = await charged();
    const res = await create({ workspaceId: sharedWs });
    expect(res.status).toBe(403);
    expect(await charged()).toBe(before);
  });

  it('refuses a workspace the caller does not belong to without charging the create quota', async () => {
    const before = await charged();
    const res = await create({ workspaceId: foreignWs });
    expect(res.status).toBe(403);
    expect(await charged()).toBe(before);
  });

  it('charges one unit for a create that succeeds', async () => {
    const before = await charged();
    const res = await create({});
    expect(res.status).toBe(200);
    expect(await charged()).toBe(before + 1);
  });
});
