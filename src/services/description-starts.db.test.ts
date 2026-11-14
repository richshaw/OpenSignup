import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDb, SESSION_SETTINGS, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import { getEnv } from '@/lib/env';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { listDescriptionStarts } from './signups';

/**
 * The read behind Your signups' guess from descriptions (#640): one bounded
 * statement for the whole workspace, never one per signup.
 */
describe('listDescriptionStarts (db)', () => {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const otherWorkspaceId = makeId('ws');
  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${organizerId.toLowerCase()}@example.com`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'viewer' },
  };

  // A client of its own with a debug hook, as in src/app/query-budget.db.test.ts,
  // so the count is every statement the read sends. The array-type lookup
  // postgres.js runs once per connection is left out.
  let statements = 0;
  const countingClient = postgres(getEnv().DATABASE_URL, {
    max: 1,
    prepare: false,
    connection: SESSION_SETTINGS,
    debug: (_connection, query) => {
      if (!query.includes('pg_catalog.pg_type')) statements += 1;
    },
  });
  const countingDb: Db = drizzle(countingClient, { schema, casing: 'snake_case' });

  /** Signup `n` was made `n` minutes after the first, so higher is newer. */
  const madeAt = (n: number) => new Date(Date.UTC(2026, 10, 1, 9, n));
  const signup = (
    n: number,
    description: string,
    extra: Partial<typeof signups.$inferInsert> = {},
  ) => {
    const id = makeId('sig');
    return {
      id,
      workspaceId,
      organizerId,
      slug: `test-${id.slice(-10).toLowerCase()}`,
      title: `Signup ${n}`,
      description,
      status: 'open',
      createdAt: madeAt(n),
      ...extra,
    } satisfies typeof signups.$inferInsert;
  };

  beforeAll(async () => {
    await db.insert(organizers).values({ id: organizerId, email: actor.email });
    await db.insert(workspaces).values(
      [workspaceId, otherWorkspaceId].map((id) => ({
        id,
        slug: `test-${id.slice(-8).toLowerCase()}`,
        name: 'Test Workspace',
        type: 'personal',
        plan: 'free',
      })),
    );
    await db.insert(signups).values([
      // 24 with a description, the newest of them 500 characters long.
      ...Array.from({ length: 23 }, (_, n) => signup(n, `Description ${n}`)),
      signup(23, `${'a'.repeat(299)}bc${'d'.repeat(199)}`),
      // Newer still, but each left out: no description, deleted, or in
      // another workspace.
      signup(30, ''),
      signup(31, 'Deleted', { deletedAt: new Date() }),
      signup(32, 'Elsewhere', { workspaceId: otherWorkspaceId }),
      // Drafts and archived signups count, as on the list.
      signup(24, 'A draft', { status: 'draft' }),
      signup(25, 'Archived', { status: 'archived' }),
    ]);
  });

  afterAll(async () => {
    await countingClient.end();
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceId, otherWorkspaceId]));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  });

  it('reads the start of the 20 newest descriptions in the workspace, in one statement', async () => {
    statements = 0;
    const result = await listDescriptionStarts(countingDb, actor, workspaceId);
    expect(statements).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      'Archived',
      'A draft',
      `${'a'.repeat(299)}b`,
      ...Array.from({ length: 17 }, (_, i) => `Description ${22 - i}`),
    ]);
  });

  it('refuses a workspace the actor isn’t a member of, before any query', async () => {
    statements = 0;
    await expect(listDescriptionStarts(countingDb, actor, otherWorkspaceId)).rejects.toThrow(
      /not a member/,
    );
    expect(statements).toBe(0);
  });
});
