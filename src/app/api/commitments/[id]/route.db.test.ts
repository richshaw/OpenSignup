import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb, type Db } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { getEmailTransport } from '@/email';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { RateLimits } from '@/lib/rate-limit';
import {
  appendReturningCommit,
  COMMIT_COOKIE_NAME,
  parseReturningCommits,
} from '@/lib/returning-participant';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { removeParticipantEmail } from '@/services/testing/participants';
import { DELETE, GET, PATCH } from './route';

// Work handed to after() runs once the response has gone. Kept here so a test
// can run it and see what it did.
const afterResponse: Array<() => unknown> = [];
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => void afterResponse.push(task),
}));

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  actor: Actor;
  signupId: string;
  slotId: string;
}

const DAY = 24 * 60 * 60;

/** The cookie's Max-Age is within a minute of `seconds`, allowing for the test's own run time. */
function expectMaxAgeNear(setCookie: string, seconds: number): void {
  expect(setCookie).toContain('os_commit=');
  const maxAge = Number(/Max-Age=(\d+)/i.exec(setCookie)?.[1]);
  expect(Math.abs(maxAge - seconds)).toBeLessThan(60);
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
    cookie?: string;
  } = {},
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const { method = 'GET', token, tokenVia = 'query', body, ip, cookie } = opts;
  const query = token && tokenVia === 'query' ? `?token=${encodeURIComponent(token)}` : '';
  const headers: Record<string, string> = { 'x-forwarded-for': ip ?? nextIp() };
  if (token && tokenVia === 'header') headers['x-edit-token'] = token;
  if (cookie !== undefined) headers.cookie = cookie;
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

  return { db, workspaceId, organizerId, actor, signupId: signup.value.id, slotId: slot.value.id };
}

async function makeCommitment(
  fx: Fixture,
): Promise<{ id: string; token: string; participantId: string }> {
  const result = await commitToSlot(fx.db, fx.slotId, {
    name: 'Route Tester',
    email: `route-${makeId('com').slice(-8).toLowerCase()}@example.test`,
    quantity: 1,
  });
  if (!result.ok) throw new Error(result.error.message);
  return {
    id: result.value.commitment.id,
    token: result.value.editToken,
    participantId: result.value.commitment.participantId,
  };
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

  // Someone without an email gets no confirmation of the move, so the
  // response and the cookie are the only places they get the new edit link.
  // The slot they move to is 200 days away, so the cookie has to outlast the
  // 60 days it used to stop at.
  it('PATCH that moves the commitment returns its new edit link and swaps it into the cookie', async () => {
    const c = await makeCommitment(fx);
    await removeParticipantEmail(fx.db, c.participantId);
    const target = await addSlot(fx.db, fx.actor, fx.signupId, { values: {}, capacity: 5 });
    if (!target.ok) throw new Error(target.error.message);
    const slotAt = new Date(Date.now() + 200 * DAY * 1000);
    await fx.db.update(slots).set({ slotAt }).where(eq(slots.id, target.value.id));
    const kept = makeId('com');
    const cookie = appendReturningCommit(
      appendReturningCommit(null, {
        commitmentId: kept,
        token: 'another-token',
        signupId: fx.signupId,
        slotAt: null,
      }),
      { commitmentId: c.id, token: c.token, signupId: fx.signupId, slotAt: null },
    );

    afterResponse.length = 0;
    const { req, ctx } = makeRequest(c.id, {
      method: 'PATCH',
      token: c.token,
      body: { swapToSlotId: target.value.id },
      cookie: `${COMMIT_COOKIE_NAME}=${encodeURIComponent(cookie)}`,
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const payload = await res.json();
    const moved = payload.data;
    expect(moved.id).not.toBe(c.id);
    expect(moved.slotId).toBe(target.value.id);
    expect(moved.moved).toBeUndefined();
    expect(moved.editUrl).toMatch(new RegExp(`/s/[^/]+/c/${moved.id}\\?token=${moved.editToken}$`));
    expect(payload._links).toEqual({
      edit: { href: moved.editUrl, method: 'GET' },
      self: { href: `/api/commitments/${moved.id}?token=${moved.editToken}`, method: 'GET' },
      cancel: { href: `/api/commitments/${moved.id}?token=${moved.editToken}`, method: 'DELETE' },
    });

    // The new link works.
    const read = makeRequest(moved.id, { token: moved.editToken });
    expect((await GET(read.req, read.ctx)).status).toBe(200);

    const setCookie = res.headers.get('set-cookie') ?? '';
    const value = /os_commit=([^;]*)/.exec(setCookie)?.[1];
    expect(value).toBeDefined();
    const weekAfterSlot = Math.floor(slotAt.getTime() / 1000) + 7 * DAY;
    expect(parseReturningCommits(decodeURIComponent(value!))).toEqual([
      {
        commitmentId: moved.id,
        token: moved.editToken,
        signupId: fx.signupId,
        expiresAt: weekAfterSlot,
      },
      {
        commitmentId: kept,
        token: 'another-token',
        signupId: fx.signupId,
        expiresAt: expect.any(Number),
      },
    ]);
    expectMaxAgeNear(setCookie, weekAfterSlot - Date.now() / 1000);

    // The confirmation still runs after the response, and sends nothing.
    expect(afterResponse).toHaveLength(1);
    const send = vi.spyOn(getEmailTransport(), 'send');
    try {
      await afterResponse[0]!();
      expect(send).not.toHaveBeenCalled();
    } finally {
      send.mockRestore();
    }
  });

  it('DELETE cancels the commitment and rewrites the returning cookie', async () => {
    const c = await makeCommitment(fx);
    const { req, ctx } = makeRequest(c.id, { method: 'DELETE', token: c.token });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('os_commit=');
    // Nothing left in it, so the 60 days it always lasted.
    expectMaxAgeNear(res.headers.get('set-cookie') ?? '', 60 * DAY);
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
