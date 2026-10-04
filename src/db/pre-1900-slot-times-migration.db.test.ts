import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';

/**
 * Migration 0010 clears slot_at wherever it falls before 1900-01-01 00:00 UTC,
 * the earliest instant `extractSlotAt` now gives. This runs the migration's
 * statements against hand-built rows inside a transaction that is always
 * rolled back, and checks it clears those rows and no others.
 */
const MIGRATION = readFileSync(
  path.resolve(__dirname, 'migrations/0010_clear_pre_1900_slot_times.sql'),
  'utf8',
)
  .split('--> statement-breakpoint')
  .map((stmt) => stmt.trim())
  .filter((stmt) => stmt.length > 0);

class Rollback extends Error {}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
}

async function setupWorkspace(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `mig10-${workspaceId.slice(-8).toLowerCase()}`;
  await db.transaction(async (tx) => {
    await tx
      .insert(organizers)
      .values({ id: organizerId, email: `${slug}@example.test`, name: 'Mig' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Migration Workspace',
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
  return { db, workspaceId, organizerId };
}

/** slot_at as rows saved before the floor could hold it, keyed by slot ref. */
const STORED = {
  'year-99': '0099-12-31T12:00:00.000Z',
  'last-minute-of-1899': '1899-12-31T23:59:00.000Z',
  'start-of-1900': '1900-01-01T00:00:00.000Z',
  modern: '2026-06-15T12:00:00.000Z',
};

describe('migration 0010_clear_pre_1900_slot_times (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  async function seed(tx: Tx): Promise<string> {
    const signupId = makeId('sig');
    await tx.insert(signups).values({
      id: signupId,
      workspaceId: fx.workspaceId,
      organizerId: fx.organizerId,
      slug: `mig10-${signupId.slice(-10).toLowerCase()}`,
      title: 'Legacy',
      settings: { reminderFromFieldRef: 'date' },
    });
    let sortOrder = 0;
    for (const [ref, at] of Object.entries(STORED)) {
      await tx.insert(slots).values({
        id: makeId('slot'),
        signupId,
        workspaceId: fx.workspaceId,
        ref,
        values: { date: at.slice(0, 10) },
        capacity: 1,
        sortOrder: sortOrder++,
        slotAt: new Date(at),
        status: 'open',
      });
    }
    return signupId;
  }

  // The app's connections are on UTC, but the migration must not depend on
  // it. New York is behind UTC, so there a bare '1900-01-01' would mean 05:00
  // UTC and clear the slot at the very start of 1900 as well.
  it.each(['UTC', 'America/New_York'])(
    'clears only the instants before 1900 UTC, on a session in %s',
    async (zone) => {
      let after: Record<string, string | null> = {};
      await expect(
        fx.db.transaction(async (tx) => {
          await tx.execute(sql.raw(`set local time zone '${zone}'`));
          const signupId = await seed(tx);
          for (const stmt of MIGRATION) await tx.execute(sql.raw(stmt));
          // Read back on UTC, as the app does.
          await tx.execute(sql`set local time zone 'UTC'`);
          const rows = await tx
            .select({ ref: slots.ref, slotAt: slots.slotAt })
            .from(slots)
            .where(eq(slots.signupId, signupId));
          after = Object.fromEntries(rows.map((r) => [r.ref, r.slotAt?.toISOString() ?? null]));
          throw new Rollback('rollback');
        }),
      ).rejects.toBeInstanceOf(Rollback);

      expect(after).toEqual({
        'year-99': null,
        'last-minute-of-1899': null,
        'start-of-1900': STORED['start-of-1900'],
        modern: STORED.modern,
      });
    },
  );
});
