import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { rateLimits } from '@/db/schema/rate-limits';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import type { ErrorReason } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { NAME_MAX_LENGTH } from '@/lib/participant-limits';
import { RateLimits } from '@/lib/rate-limit';
import { parseReturningCommits } from '@/lib/returning-participant';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { POST } from './route';

// The confirmation runs after the response, and these sign-ups give no email,
// so nothing is run; the calls are kept to see which requests queued one.
const after = vi.hoisted(() => vi.fn());
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after,
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

  async function signUp(slotId: string, extra: { idempotencyKey?: string } = {}) {
    const req = new NextRequest(`http://localhost/api/slots/${slotId}/commitments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ name: 'Robin Example', quantity: 1, ...extra }),
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

  // The first response never arrived, so the form sends the same request again.
  it('answers a retry with the same idempotency key as it did the first, and mails nothing', async () => {
    const slotId = await newSlot(null);
    const idempotencyKey = randomBytes(16).toString('hex');

    after.mockClear();
    const first = await signUp(slotId, { idempotencyKey });
    expect(after).toHaveBeenCalledTimes(1);
    const again = await signUp(slotId, { idempotencyKey });
    expect(after).toHaveBeenCalledTimes(1);

    for (const res of [first, again]) {
      expect(res.payload.data.commitment).not.toHaveProperty('editTokenHash');
      expect(res.payload.data.commitment).not.toHaveProperty('idempotencyKeyHash');
    }

    const { id } = first.payload.data.commitment;
    expect(again.payload.data.commitment.id).toBe(id);
    expect(again.payload.data.editToken).toBe(first.payload.data.editToken);
    expect(again.payload.data.editUrl).toBe(first.payload.data.editUrl);
    expect(Object.keys(again.payload.data).sort()).toEqual(Object.keys(first.payload.data).sort());
    expect(again.payload.data).not.toHaveProperty('repeated');
    // The cookie the lost response carried comes with the retry instead.
    for (const { entries } of [first, again]) {
      expect(entries).toEqual([
        expect.objectContaining({ commitmentId: id, token: first.payload.data.editToken }),
      ]);
    }
  });

  // The sign-up sheet words an `invalid_input` by its `details.reason`. The
  // reason comes after the fields the API has always sent, which stay as they
  // were, byte for byte, in English for API callers.
  describe('a refused sign-up', () => {
    // Its own address, so these stay clear of the per-IP limit the tests above
    // spend, and a fresh email each run for the per-address one.
    const refusedIp = `2001:db8::1:${Math.floor(Math.random() * 0xffff).toString(16)}`;
    const email = `pat-${randomBytes(4).toString('hex')}@localhost`;

    afterAll(async () => {
      await db
        .delete(rateLimits)
        .where(
          and(
            inArray(rateLimits.bucket, [
              RateLimits.commitmentPerIp.bucket,
              RateLimits.commitmentPerEmail.bucket,
            ]),
            inArray(rateLimits.subject, [refusedIp, email]),
          ),
        );
    });

    async function refuse(slotId: string, body: Record<string, unknown>) {
      const req = new NextRequest(`http://localhost/api/slots/${slotId}/commitments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': refusedIp },
        body: JSON.stringify(body),
      });
      const res = await POST(req, { params: Promise.resolve({ id: slotId }) });
      return { status: res.status, text: await res.text() };
    }

    /** `before`, the body as it was, with `details.reason` added at the end. */
    function withReason(before: string, reason: ErrorReason): string {
      return `${before.slice(0, -2)},"details":{"reason":"${reason}"}}}`;
    }

    it('names an email that is not an address', async () => {
      // The browser takes `pat@localhost` as an email; the server doesn't.
      const refused = await refuse(await newSlot(null), { name: 'Robin Example', email });
      expect(refused.status).toBe(400);
      expect(refused.text).toBe(
        withReason(
          '{"error":{"code":"invalid_input","message":"Invalid email","field":"email","suggestion":"Check the value of \\"email\\"."}}',
          'email_invalid',
        ),
      );
    });

    it('names an email the signup asks for and did not get', async () => {
      // The default settings ask for an email; this file's signup doesn't.
      const asks = await createSignup(db, actor, workspaceId, {
        title: 'Commit POST test, email required',
        description: '',
        tags: [],
        visibility: 'unlisted' as const,
        settings: {},
      });
      if (!asks.ok) throw new Error(asks.error.message);
      const slot = await addSlot(db, actor, asks.value.id, { values: {}, capacity: 5 });
      if (!slot.ok) throw new Error(slot.error.message);
      const published = await publishSignup(db, actor, asks.value.id);
      if (!published.ok) throw new Error(published.error.message);

      const refused = await refuse(slot.value.id, { name: 'Robin Example', quantity: 1 });
      expect(refused.status).toBe(400);
      expect(refused.text).toBe(
        withReason(
          '{"error":{"code":"invalid_input","message":"Email is required for this signup.","field":"email","suggestion":"Add your email and try again."}}',
          'email_required',
        ),
      );
    });

    it('names a name that is too long', async () => {
      const refused = await refuse(await newSlot(null), {
        name: 'x'.repeat(NAME_MAX_LENGTH + 1),
      });
      expect(refused.status).toBe(400);
      expect(refused.text).toBe(
        withReason(
          `{"error":{"code":"invalid_input","message":"String must contain at most ${NAME_MAX_LENGTH} character(s)","field":"name","suggestion":"Check the value of \\"name\\"."}}`,
          'name_too_long',
        ),
      );
    });
  });
});
