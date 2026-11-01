import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { rateLimits } from '@/db/schema/rate-limits';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import { ServiceException } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { chargeRateLimit, consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { createSignupAction, type NewSignupFormState } from './actions';

const organizerId = makeId('org');
const workspaceId = makeId('ws');
const slug = `test-${workspaceId.slice(-8).toLowerCase()}`;
const email = `${slug}@example.test`;
const owner: Actor = {
  kind: 'organizer',
  id: organizerId,
  email,
  workspaceIds: [workspaceId],
  workspaceRoles: { [workspaceId]: 'owner' },
};

// The action reads the organizer from the session cookie. Tests hand it one
// directly instead of going through Auth.js.
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({ organizerId, defaultWorkspaceId: workspaceId }),
  toActor: () => owner,
}));

// Next's redirect() throws to end the action; this one throws the address.
class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`);
  }
}
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));

type Answer = { redirect: string } | { refused: NonNullable<NewSignupFormState> };

async function submit(title: string, description = ''): Promise<Answer> {
  const form = new FormData();
  form.set('title', title);
  form.set('description', description);
  try {
    const state = await createSignupAction(null, form);
    if (state) return { refused: state };
  } catch (e) {
    if (e instanceof Redirected) return { redirect: e.url };
    throw e;
  }
  throw new Error('the action neither redirected nor refused');
}

describe('createSignupAction (db)', () => {
  const db = getDb();
  const policy = RateLimits.signupCreatePerOrganizer;
  const bucket = and(eq(rateLimits.bucket, policy.bucket), eq(rateLimits.subject, organizerId));
  const created = async () =>
    db.select({ id: signups.id }).from(signups).where(eq(signups.workspaceId, workspaceId));

  beforeAll(async () => {
    await db.transaction(async (tx) => {
      await tx.insert(organizers).values({ id: organizerId, email, name: 'Test Org' });
      await tx.insert(workspaces).values({
        id: workspaceId,
        slug,
        name: 'Test Workspace',
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
  });

  beforeEach(async () => {
    await db.delete(rateLimits).where(bucket);
    await db.delete(signups).where(eq(signups.workspaceId, workspaceId));
  });

  afterAll(async () => {
    await db.delete(rateLimits).where(bucket);
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  });

  it('creates the signup and charges the per-organizer create quota', async () => {
    const answer = await submit('Snack duty');
    const rows = await created();
    expect(rows).toHaveLength(1);
    expect(answer).toEqual({ redirect: `/app/signups/${rows[0]!.id}` });
    const [charged] = await db.select({ count: rateLimits.count }).from(rateLimits).where(bucket);
    expect(charged?.count).toBe(1);
  });

  it('refuses a title of only spaces with the Build tab’s message', async () => {
    expect(await submit('   ')).toEqual({
      refused: { error: 'Title must be at least 2 characters.', title: '   ', description: '' },
    });
    expect(await created()).toHaveLength(0);
  });

  it('hands back the title and description as typed when it refuses', async () => {
    // One letter with spaces round it passes the browser's minLength of 2,
    // then the server trims it and refuses.
    const description = 'Bring a plate.\r\nNuts are fine.';
    expect(await submit(' a ', description)).toEqual({
      refused: { error: 'Title must be at least 2 characters.', title: ' a ', description },
    });
    expect(await created()).toHaveLength(0);
  });

  it('saves the title trimmed', async () => {
    await submit('  Bake sale  ');
    const rows = await db
      .select({ title: signups.title })
      .from(signups)
      .where(eq(signups.workspaceId, workspaceId));
    expect(rows.map((r) => r.title)).toEqual(['Bake sale']);
  });

  it('refuses a create past the limit, back on the form with a plain message', async () => {
    // Everything but the last unit of this hour's quota is already spent.
    await chargeRateLimit(db, policy, organizerId, policy.max - 1);
    expect(await submit('Last one')).toEqual({
      redirect: expect.stringMatching(/^\/app\/signups\/[^?]+$/),
    });

    const answer = await submit('One too many', 'Kept');
    if (!('refused' in answer)) throw new Error('expected a refusal');
    expect(answer.refused).toMatchObject({ title: 'One too many', description: 'Kept' });
    expect(answer.refused.error).toMatch(
      /^You’ve created a lot of signups in the last hour\. Try again in about \d+ minutes?\.$/,
    );
    expect(await created()).toHaveLength(1);
  });

  it('shares its bucket with POST /api/signups', async () => {
    // The form fills the quota; the route's own charge is then refused.
    await chargeRateLimit(db, policy, organizerId, policy.max - 1);
    await submit('Fills the quota');
    await expect(consumeRateLimit(db, policy, organizerId)).rejects.toSatisfy(
      (e) => e instanceof ServiceException && e.serviceError.code === 'rate_limited',
    );

    // And the other way round: spent by the route, refused on the form.
    await db.delete(rateLimits).where(bucket);
    await chargeRateLimit(db, policy, organizerId, policy.max);
    expect(await submit('Refused')).toHaveProperty('refused');
  });
});
