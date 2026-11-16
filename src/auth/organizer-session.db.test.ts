import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb, SESSION_SETTINGS } from '@/db/client';
import * as schema from '@/db/schema';
import { sessions } from '@/db/schema/auth';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { getEnv } from '@/lib/env';
import { makeId } from '@/lib/ids';
import { SESSION_MAX_AGE_SECONDS } from './session-lifetime';
import { loadOrganizerSessionById, toActor } from './organizer-session';
import { getOrganizerSession } from './session';

// The cookie path reads the Auth.js session cookie through next/headers.
let cookieHeader = '';
vi.mock('next/headers', () => ({
  cookies: async () => {
    const { RequestCookies } = await import('next/dist/compiled/@edge-runtime/cookies');
    return new RequestCookies(new Headers({ cookie: cookieHeader }));
  },
  headers: async () => new Headers({ cookie: cookieHeader }),
}));

const db = getDb();

// A second client that counts every statement sent through it, like
// query-budget.db.test.ts, leaving out the array-type lookup postgres.js runs
// once per new connection.
let statements = 0;
const countingClient = postgres(getEnv().DATABASE_URL, {
  max: 1,
  prepare: false,
  connection: SESSION_SETTINGS,
  debug: (_connection, query) => {
    if (!query.includes('pg_catalog.pg_type')) statements += 1;
  },
});
const countingDb = drizzle(countingClient, { schema, casing: 'snake_case' });

let organizerId: string;
const workspaceIds = [makeId('ws'), makeId('ws')];

async function saveLocale(locale: string | null) {
  await db.update(organizers).set({ locale }).where(eq(organizers.id, organizerId));
}

beforeAll(async () => {
  organizerId = makeId('org');
  await db.insert(organizers).values({
    id: organizerId,
    email: `${organizerId.toLowerCase()}@example.com`,
    defaultWorkspaceId: workspaceIds[0],
  });
  // Two memberships, so the join returns two rows and the language has to
  // come from the organizer's columns, not from either membership's row.
  for (const [i, workspaceId] of workspaceIds.entries()) {
    await db.insert(workspaces).values({
      id: workspaceId,
      slug: workspaceId.toLowerCase(),
      name: `Locale ${i}`,
      type: 'personal',
      plan: 'free',
    });
    await db.insert(workspaceMembers).values({
      id: makeId('mem'),
      workspaceId,
      organizerId,
      role: i === 0 ? 'owner' : 'editor',
      status: 'active',
    });
  }
});

afterAll(async () => {
  for (const workspaceId of workspaceIds) {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  }
  await db.delete(organizers).where(eq(organizers.id, organizerId));
  await countingClient.end();
});

describe('loadOrganizerSessionById and the saved language', () => {
  it('returns the saved language in the one statement it already sends', async () => {
    await saveLocale('sv');
    statements = 0;
    const session = await loadOrganizerSessionById(countingDb, organizerId);
    expect(statements).toBe(1);
    expect(session?.locale).toBe('sv');
    expect(session?.memberships).toHaveLength(2);
  });

  it('gives null when the organizer has saved none', async () => {
    await saveLocale(null);
    const session = await loadOrganizerSessionById(db, organizerId);
    expect(session).not.toBeNull();
    expect(session?.locale).toBeNull();
  });

  it('returns a stored value that names no language as stored, and still gives a session', async () => {
    for (const junk of ['', 'tlh', 'sv_SE', 'not a language at all']) {
      await saveLocale(junk);
      const session = await loadOrganizerSessionById(db, organizerId);
      expect(session?.locale).toBe(junk);
      expect(toActor(session)).toMatchObject({ kind: 'organizer', id: organizerId });
    }
  });

  it('keeps the language off the actor, so it is the same whatever was saved', async () => {
    await saveLocale(null);
    const unset = toActor(await loadOrganizerSessionById(db, organizerId));
    await saveLocale('sv');
    const saved = toActor(await loadOrganizerSessionById(db, organizerId));
    expect(saved).toEqual(unset);
    expect(saved).not.toHaveProperty('locale');
  });
});

describe('getOrganizerSession, the cookie path', () => {
  let sessionToken: string;

  beforeAll(async () => {
    sessionToken = randomBytes(32).toString('hex');
    await db.insert(sessions).values({
      sessionToken,
      userId: organizerId,
      expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    });
    cookieHeader = `authjs.session-token=${sessionToken}`;
  });

  afterAll(async () => {
    cookieHeader = '';
    await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken));
  });

  it.each([
    ['as saved', 'sv'],
    ['null when unset', null],
    ['raw, a value that names no language', 'not a language at all'],
  ])("carries the organizer's language %s", async (_name, locale) => {
    await saveLocale(locale);
    const session = await getOrganizerSession();
    expect(session?.organizerId).toBe(organizerId);
    expect(session?.locale).toBe(locale);
  });
});
