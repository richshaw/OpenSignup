import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb, type Db } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { RateLimits } from '@/lib/rate-limit';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { DELETE, GET, PATCH } from './route';

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  actor: Actor;
  slotId: string;
}

// Each request gets a unique source IP so the per-IP limiter never throttles
// unrelated assertions; the rate-limit test pins one IP deliberately.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 254 || 1}`;
}

function makeRequest(
  commitmentId: string,
  opts: {
    method?: 'GET' | 'PATCH' | 'DELETE';
    token?: string | undefined;
    tokenVia?: 'query' | 'header';
    body?: unknown;
    ip?: string;
  } = {},
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const { method = 'GET', token, tokenVia = 'query', body, ip } = opts;
  const query = token && tokenVia === 'query' ? `?token=${encodeURIComponent(token)}` : '';
  const headers: Record<string, string> = { 'x-forwarded-for': ip ?? nextIp() };
  if (token && tokenVia === 'header') headers['x-edit-token'] = token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const req = new NextRequest(`http://localhost/api/commitments/${commitmentId}${query}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { req, ctx: { params: Promise.resolve({ id: commitmentId }) } };
}

async function setupFixture(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `cr-${workspaceId.slice(-8).toLowerCase()}`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email: `${slug}@example.test` });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Commit Route Test',
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

  const signup = await createSignup(db, actor, workspaceId, {
    title: 'Commit route test',
    description: '',
    tags: [],
    visibility: 'unlisted' as const,
    settings: {},
  });
  if (!signup.ok) throw new Error(signup.error.message);
  const slot = await addSlot(db, actor, signup.value.id, { values: {}, capacity: 50 });
  if (!slot.ok) throw new Error(slot.error.message);
  const pub = await publishSignup(db, actor, signup.value.id);
  if (!pub.ok) throw new Error(pub.error.message);

  return { db, workspaceId, organizerId, actor, slotId: slot.value.id };
}

async function makeCommitment(fx: Fixture): Promise<{ id: string; token: string }> {
  const result = await commitToSlot(fx.db, fx.slotId, {
    name: 'Route Tester',
    email: `route-${makeId('com').slice(-8).toLowerCase()}@example.test`,
    quantity: 1,
  });
  if (!result.ok) throw new Error(result.error.message);
  return { id: result.value.commitment.id, token: result.value.editToken };
}

describe('/api/commitments/[id] (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupFixture();
  });

  afterAll(async () => {
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it('GET accepts the token from the query string', async () => {
    const c = await makeCommitment(fx);
    const { req, ctx } = makeRequest(c.id, { token: c.token });
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.data.id).toBe(c.id);
    expect(payload.data.participantName).toBe('Route Tester');
  });

  it('GET accepts the token from the x-edit-token header', async () => {
    const c = await makeCommitment(fx);
    const { req, ctx } = makeRequest(c.id, { token: c.token, tokenVia: 'header' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
  });

  it('GET without a token returns 403', async () => {
    const c = await makeCommitment(fx);
    const { req, ctx } = makeRequest(c.id, {});
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    const payload = await res.json();
    expect(payload.error.code).toBe('forbidden');
  });

  it('GET with a wrong token returns 403', async () => {
    const c = await makeCommitment(fx);
    const { req, ctx } = makeRequest(c.id, { token: 'not-the-token' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
  });

  it('PATCH updates notes with a valid token', async () => {
    const c = await makeCommitment(fx);
    const { req, ctx } = makeRequest(c.id, {
      method: 'PATCH',
      token: c.token,
      body: { notes: 'updated by route test' },
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const [row] = await fx.db
      .select({ notes: commitments.notes })
      .from(commitments)
      .where(eq(commitments.id, c.id))
      .limit(1);
    expect(row?.notes).toBe('updated by route test');
  });

  it('DELETE cancels the commitment and rewrites the returning cookie', async () => {
    const c = await makeCommitment(fx);
    const { req, ctx } = makeRequest(c.id, { method: 'DELETE', token: c.token });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('os_commit=');
    const [row] = await fx.db
      .select({ status: commitments.status })
      .from(commitments)
      .where(eq(commitments.id, c.id))
      .limit(1);
    expect(row?.status).toBe('cancelled');
  });

  it('throttles a single IP after the per-minute ceiling, before token checks', async () => {
    const c = await makeCommitment(fx);
    const ip = '198.51.100.250';
    const max = RateLimits.commitmentTokenOpsPerIp.max;
    // Token-less requests: proves the limiter runs before the token check.
    // 2*max+2 attempts guarantee one fixed window absorbs >max requests even
    // if the loop happens to straddle a window boundary.
    let limited: Response | null = null;
    for (let i = 0; i < 2 * max + 2 && !limited; i += 1) {
      const { req, ctx } = makeRequest(c.id, { ip });
      const res = await GET(req, ctx);
      expect([403, 429]).toContain(res.status);
      if (res.status === 429) limited = res;
    }
    expect(limited).not.toBeNull();
    expect(limited!.headers.get('Retry-After')).toMatch(/^\d+$/);
    const payload = await limited!.json();
    expect(payload.error.code).toBe('rate_limited');
  });
});
