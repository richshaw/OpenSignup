import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { rateLimits } from '@/db/schema/rate-limits';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { RateLimits } from '@/lib/rate-limit';
import { parseReturningCommits } from '@/lib/returning-participant';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { POST } from './route';

// The confirmation runs after the response, and these sign-ups give no email.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}));

const DAY = 24 * 60 * 60;

describe('POST /api/slots/[id]/commitments (db)', () => {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  // A fresh documentation address each run keeps reruns clear of the per-IP
  // limit; afterAll deletes its row, since rate_limits has no tie to the workspace.
  const ip = `2001:db8::${Math.floor(Math.random() * 0xffff).toString(16)}`;
  const wsSlug = `cp-${workspaceId.slice(-8).toLowerCase()}`;
  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${wsSlug}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  let signupId = '';

  async function newSlot(slotAt: Date | null): Promise<string> {
    const slot = await addSlot(db, actor, signupId, { values: {}, capacity: 5 });
    if (!slot.ok) throw new Error(slot.error.message);
    if (slotAt) await db.update(slots).set({ slotAt }).where(eq(slots.id, slot.value.id));
    return slot.value.id;
  }

  async function signUp(slotId: string) {
    const req = new NextRequest(`http://localhost/api/slots/${slotId}/commitments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ name: 'Robin Example', quantity: 1 }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: slotId }) });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    const value = /os_commit=([^;]*)/.exec(setCookie)?.[1] ?? '';
    return {
      payload: await res.json(),
      maxAge: Number(/Max-Age=(\d+)/i.exec(setCookie)?.[1]),
      entries: parseReturningCommits(decodeURIComponent(value)),
    };
  }

  beforeAll(async () => {
    await db.insert(organizers).values({ id: organizerId, email: `${wsSlug}@example.test` });
    await db.insert(workspaces).values({
      id: workspaceId,
      slug: wsSlug,
      name: 'Commit POST test',
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
    const signup = await createSignup(db, actor, workspaceId, {
      title: 'Commit POST test',
      description: '',
      tags: [],
      visibility: 'unlisted' as const,
      settings: { requireEmail: false },
    });
    if (!signup.ok) throw new Error(signup.error.message);
    signupId = signup.value.id;
    const published = await publishSignup(db, actor, signupId);
    if (!published.ok) throw new Error(published.error.message);
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
    await db
      .delete(rateLimits)
      .where(
        and(eq(rateLimits.bucket, RateLimits.commitmentPerIp.bucket), eq(rateLimits.subject, ip)),
      );
  });

  // Someone without an email who signs up months ahead has only this browser
  // to find their link again, and no reminder to bring them back to it.
  it('remembers a sign-up for a slot 200 days away until a week after it', async () => {
    const slotAt = new Date(Date.now() + 200 * DAY * 1000);
    const { payload, maxAge, entries } = await signUp(await newSlot(slotAt));
    const weekAfterSlot = Math.floor(slotAt.getTime() / 1000) + 7 * DAY;
    expect(entries).toEqual([
      {
        commitmentId: payload.data.commitment.id,
        token: payload.data.editToken,
        signupId,
        expiresAt: weekAfterSlot,
      },
    ]);
    expect(Math.abs(maxAge - (weekAfterSlot - Date.now() / 1000))).toBeLessThan(60);
    // The slot's instant is for the cookie, not the response.
    expect(payload.data).not.toHaveProperty('slotAt');
  });

  it('remembers a sign-up for a slot with no date for 60 days', async () => {
    const { maxAge, entries } = await signUp(await newSlot(null));
    expect(entries).toHaveLength(1);
    expect(Math.abs(maxAge - 60 * DAY)).toBeLessThan(60);
  });
});
