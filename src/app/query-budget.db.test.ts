import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import postgres from 'postgres';
import budgets from '../../budgets.json';
import { getDb } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { getEnv } from '@/lib/env';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { COMMIT_COOKIE_NAME, serializeReturningCommits } from '@/lib/returning-participant';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { POST as commitPost } from './api/slots/[id]/commitments/route';
import PublicSignupPage from './s/[slug]/page';

// Work handed to after() runs once the response has gone, so the participant
// never waits on it. It is left out of the count.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}));

let cookieHeader = '';
vi.mock('next/headers', () => ({
  cookies: async () => {
    const { RequestCookies } = await import('next/dist/compiled/@edge-runtime/cookies');
    return new RequestCookies(new Headers({ cookie: cookieHeader }));
  },
  headers: async () => new Headers(),
}));

// Every statement the app sends goes through the client cached on globalThis,
// so swapping in one with a debug hook counts all of them, BEGIN and COMMIT
// included: each is a round trip to Postgres. The array-type lookup postgres.js
// runs once per new connection is left out, so the count doesn't depend on how
// warm the pool is.
let statements = 0;
const previousClient = globalThis.__signup_pg__;
const countingClient = postgres(getEnv().DATABASE_URL, {
  max: 4,
  prepare: false,
  debug: (_connection, query) => {
    if (!query.includes('pg_catalog.pg_type')) statements += 1;
  },
});

async function countStatements(run: () => Promise<unknown>): Promise<number> {
  statements = 0;
  await run();
  return statements;
}

function expectWithinBudget(name: keyof typeof budgets.queries, actual: number) {
  const budget = budgets.queries[name];
  const hint =
    actual > budget
      ? `${name} sends ${actual} statements to Postgres, over its budget of ${budget}. ` +
        'Cut one, or raise the budget in budgets.json and say why in the PR.'
      : `${name} sends ${actual} statements, under its budget of ${budget}. ` +
        `Lower the budget in budgets.json to ${actual} so it stays there.`;
  expect(actual, hint).toBe(budget);
}

describe('query budgets for the participant hot path (db)', () => {
  let workspaceId: string;
  let organizerId: string;
  let slug: string;
  let slotId: string;

  beforeAll(async () => {
    globalThis.__signup_pg__ = countingClient;
    const db = getDb();
    organizerId = makeId('org');
    workspaceId = makeId('ws');
    const wsSlug = `qb-${workspaceId.slice(-8).toLowerCase()}`;
    await db.insert(organizers).values({ id: organizerId, email: `${wsSlug}@example.test` });
    await db.insert(workspaces).values({
      id: workspaceId,
      slug: wsSlug,
      name: 'Query budget test',
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
    const actor: Actor = {
      kind: 'organizer',
      id: organizerId,
      email: `${wsSlug}@example.test`,
      workspaceIds: [workspaceId],
      workspaceRoles: { [workspaceId]: 'owner' },
    };
    const signup = await createSignup(db, actor, workspaceId, {
      title: 'Query budget test',
      description: '',
      tags: [],
      visibility: 'unlisted' as const,
      settings: {},
    });
    if (!signup.ok) throw new Error(signup.error.message);
    const slot = await addSlot(db, actor, signup.value.id, { values: {}, capacity: 50 });
    if (!slot.ok) throw new Error(slot.error.message);
    const published = await publishSignup(db, actor, signup.value.id);
    if (!published.ok) throw new Error(published.error.message);
    slug = signup.value.slug;
    slotId = slot.value.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
    globalThis.__signup_pg__ = previousClient;
    await countingClient.end();
  });

  it('GET /s/[slug], for a returning participant', async () => {
    const committed = await commitToSlot(getDb(), slotId, {
      name: 'Pat Example',
      email: `pat-${makeId('par').slice(-8).toLowerCase()}@example.test`,
      quantity: 1,
    });
    if (!committed.ok) throw new Error(committed.error.message);
    cookieHeader = `${COMMIT_COOKIE_NAME}=${serializeReturningCommits([
      {
        commitmentId: committed.value.commitment.id,
        token: committed.value.editToken,
        signupId: committed.value.commitment.signupId,
      },
    ])}`;

    const count = await countStatements(() =>
      PublicSignupPage({ params: Promise.resolve({ slug }) }),
    );
    expectWithinBudget('GET /s/[slug]', count);
  });

  it('POST /api/slots/[id]/commitments, for a new participant', async () => {
    const req = new NextRequest(`http://localhost/api/slots/${slotId}/commitments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // A fresh documentation address each run, so reruns never meet the per-IP limit.
        'x-forwarded-for': `2001:db8::${Math.floor(Math.random() * 0xffff).toString(16)}`,
      },
      body: JSON.stringify({
        name: 'Sam Example',
        email: `sam-${makeId('par').slice(-8).toLowerCase()}@example.test`,
        quantity: 1,
      }),
    });
    let status = 0;
    const count = await countStatements(async () => {
      const res = await commitPost(req, { params: Promise.resolve({ id: slotId }) });
      status = res.status;
    });
    expect(status).toBe(200);
    expectWithinBudget('POST /api/slots/[id]/commitments', count);
  });
});
