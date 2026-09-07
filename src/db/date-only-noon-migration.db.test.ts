import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { slotFields } from '@/db/schema/slot-fields';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import { extractSlotAt, listFieldsForSignup } from '@/services/slot-fields';

/**
 * Migration 0006 moves every date-only slot from a midnight-UTC anchor to noon
 * UTC, in SQL that duplicates `extractSlotAt`. This runs the migration's
 * statements against hand-built rows in their pre-migration shape inside a
 * transaction that is always rolled back, and checks the SQL lands exactly
 * where the TypeScript would.
 */
const MIGRATION = readFileSync(
  path.resolve(__dirname, 'migrations/0006_date_only_slots_at_noon.sql'),
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
  const slug = `mig6-${workspaceId.slice(-8).toLowerCase()}`;
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

type FieldSpec = { ref: string; fieldType: 'date' | 'time' | 'text'; sortOrder: number };

interface LegacySignup {
  settings: Record<string, unknown>;
  fields: FieldSpec[];
  slotValues: Record<string, unknown>;
  /** What the row held before this migration: midnight for a date-only slot. */
  slotAt: Date | null;
}

async function insertLegacy(
  tx: Tx,
  fx: Fixture,
  spec: LegacySignup,
): Promise<{ signupId: string; slotId: string }> {
  const signupId = makeId('sig');
  const slotId = makeId('slot');
  await tx.insert(signups).values({
    id: signupId,
    workspaceId: fx.workspaceId,
    organizerId: fx.organizerId,
    slug: `mig6-${signupId.slice(-10).toLowerCase()}`,
    title: 'Legacy',
    settings: spec.settings,
  });
  for (const f of spec.fields) {
    await tx.insert(slotFields).values({
      id: makeId('fld'),
      signupId,
      workspaceId: fx.workspaceId,
      ref: f.ref,
      label: f.ref,
      fieldType: f.fieldType,
      sortOrder: f.sortOrder,
      config: { fieldType: f.fieldType, ...(f.fieldType === 'text' ? { maxLength: 200 } : {}) },
    });
  }
  await tx.insert(slots).values({
    id: slotId,
    signupId,
    workspaceId: fx.workspaceId,
    ref: 'slot',
    values: spec.slotValues,
    capacity: 1,
    sortOrder: 0,
    slotAt: spec.slotAt,
    status: 'open',
  });
  return { signupId, slotId };
}

describe('migration 0006_date_only_slots_at_noon (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await fx.db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, fx.workspaceId));
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  async function runMigration(tx: Tx): Promise<void> {
    for (const stmt of MIGRATION) await tx.execute(sql.raw(stmt));
  }

  /**
   * Runs `body` after the migration statements, all inside one transaction
   * that is rolled back at the end, so nothing this test builds survives.
   */
  async function withMigrated(
    seed: (tx: Tx) => Promise<void>,
    body: (tx: Tx) => Promise<void>,
  ): Promise<void> {
    await expect(
      fx.db.transaction(async (tx) => {
        await seed(tx);
        await runMigration(tx);
        await body(tx);
        throw new Rollback('rollback');
      }),
    ).rejects.toBeInstanceOf(Rollback);
  }

  async function slotAtOf(tx: Tx, id: string): Promise<Date | null> {
    const [row] = await tx.select({ slotAt: slots.slotAt }).from(slots).where(eq(slots.id, id));
    return row?.slotAt ?? null;
  }

  /** What `extractSlotAt` says the slot should hold, from the same rows. */
  async function expectedFor(
    tx: Tx,
    signupId: string,
    values: Record<string, unknown>,
  ): Promise<Date | null> {
    const [row] = await tx
      .select({ settings: signups.settings })
      .from(signups)
      .where(eq(signups.id, signupId));
    const fields = await listFieldsForSignup(tx, signupId);
    return extractSlotAt((row?.settings ?? {}) as Record<string, unknown>, fields, values);
  }

  it('moves a date-only slot from midnight to noon UTC, where extractSlotAt now puts it', async () => {
    let ids!: { signupId: string; slotId: string };
    const values = { what: 'Cake', date: '2026-06-15' };
    await withMigrated(
      async (tx) => {
        ids = await insertLegacy(tx, fx, {
          settings: { reminderFromFieldRef: 'date', sendReminders: true, groupByFieldRefs: [] },
          fields: [
            { ref: 'what', fieldType: 'text', sortOrder: 0 },
            { ref: 'date', fieldType: 'date', sortOrder: 1 },
          ],
          slotValues: values,
          slotAt: new Date('2026-06-15T00:00:00.000Z'),
        });
      },
      async (tx) => {
        expect((await slotAtOf(tx, ids.slotId))?.toISOString()).toBe('2026-06-15T12:00:00.000Z');
        const expected = await expectedFor(tx, ids.signupId, values);
        expect((await slotAtOf(tx, ids.slotId))?.getTime()).toBe(expected?.getTime());

        // Idempotent: a second pass finds nothing to move, and the temp helper
        // is re-created rather than rejected as already existing.
        await runMigration(tx);
        expect((await slotAtOf(tx, ids.slotId))?.toISOString()).toBe('2026-06-15T12:00:00.000Z');
      },
    );
  });

  it('keeps a slot with a time value exactly where it was', async () => {
    let ids!: { signupId: string; slotId: string };
    const values = { date: '2026-06-15', at: '09:30' };
    await withMigrated(
      async (tx) => {
        ids = await insertLegacy(tx, fx, {
          settings: { reminderFromFieldRef: 'date' },
          fields: [
            { ref: 'date', fieldType: 'date', sortOrder: 0 },
            { ref: 'at', fieldType: 'time', sortOrder: 1 },
          ],
          slotValues: values,
          slotAt: new Date('2026-06-15T09:30:00.000Z'),
        });
      },
      async (tx) => {
        expect((await slotAtOf(tx, ids.slotId))?.toISOString()).toBe('2026-06-15T09:30:00.000Z');
        const expected = await expectedFor(tx, ids.signupId, values);
        expect((await slotAtOf(tx, ids.slotId))?.getTime()).toBe(expected?.getTime());
      },
    );
  });

  it('treats a blank time value as date-only', async () => {
    let ids!: { signupId: string; slotId: string };
    const values = { date: '2026-06-15', at: '' };
    await withMigrated(
      async (tx) => {
        ids = await insertLegacy(tx, fx, {
          settings: { reminderFromFieldRef: 'date' },
          fields: [
            { ref: 'date', fieldType: 'date', sortOrder: 0 },
            { ref: 'at', fieldType: 'time', sortOrder: 1 },
          ],
          slotValues: values,
          slotAt: new Date('2026-06-15T00:00:00.000Z'),
        });
      },
      async (tx) => {
        expect((await slotAtOf(tx, ids.slotId))?.toISOString()).toBe('2026-06-15T12:00:00.000Z');
        const expected = await expectedFor(tx, ids.signupId, values);
        expect((await slotAtOf(tx, ids.slotId))?.getTime()).toBe(expected?.getTime());
      },
    );
  });

  it('pairs the time field with the chosen date exactly as extractSlotAt does', async () => {
    let ids!: { signupId: string; slotId: string };
    const values = {
      'return-time': '17:45',
      return: '2026-07-02',
      'depart-time': '06:15',
      depart: '2026-07-01',
    };
    await withMigrated(
      async (tx) => {
        ids = await insertLegacy(tx, fx, {
          settings: { reminderFromFieldRef: 'return' },
          fields: [
            { ref: 'return', fieldType: 'date', sortOrder: 2 },
            { ref: 'return-time', fieldType: 'time', sortOrder: 3 },
            { ref: 'depart', fieldType: 'date', sortOrder: 0 },
            { ref: 'depart-time', fieldType: 'time', sortOrder: 1 },
          ],
          slotValues: values,
          // Stale: what a pre-0005 auto-pick might have left behind.
          slotAt: new Date('2026-07-02T00:00:00.000Z'),
        });
      },
      async (tx) => {
        const expected = await expectedFor(tx, ids.signupId, values);
        expect(expected?.toISOString()).toBe('2026-07-02T17:45:00.000Z');
        expect((await slotAtOf(tx, ids.slotId))?.getTime()).toBe(expected?.getTime());
      },
    );
  });

  it('leaves a slot alone when its signup has no anchor', async () => {
    let stranded!: { signupId: string; slotId: string };
    let empty!: { signupId: string; slotId: string };
    await withMigrated(
      async (tx) => {
        stranded = await insertLegacy(tx, fx, {
          settings: {},
          fields: [{ ref: 'when', fieldType: 'date', sortOrder: 0 }],
          slotValues: { when: '2026-08-01' },
          slotAt: new Date('2026-08-01T00:00:00.000Z'),
        });
        empty = await insertLegacy(tx, fx, {
          settings: { sendReminders: true },
          fields: [{ ref: 'what', fieldType: 'text', sortOrder: 0 }],
          slotValues: { what: 'Chairs' },
          slotAt: null,
        });
      },
      async (tx) => {
        // Not the migration's to fix: the services own slot_at on a signup with
        // no anchor, and 0005 already cleared the ref on every such signup.
        expect((await slotAtOf(tx, stranded.slotId))?.toISOString()).toBe(
          '2026-08-01T00:00:00.000Z',
        );
        expect(await slotAtOf(tx, empty.slotId)).toBeNull();
      },
    );
  });

  it('stores NULL rather than a rolled-over date for an impossible legacy value', async () => {
    let ids!: { signupId: string; slotId: string };
    const values = { when: '2026-02-30' };
    await withMigrated(
      async (tx) => {
        ids = await insertLegacy(tx, fx, {
          settings: { reminderFromFieldRef: 'when' },
          fields: [{ ref: 'when', fieldType: 'date', sortOrder: 0 }],
          slotValues: values,
          // What `new Date('2026-02-30T00:00:00Z')` used to roll into.
          slotAt: new Date('2026-03-02T00:00:00.000Z'),
        });
      },
      async (tx) => {
        expect(await slotAtOf(tx, ids.slotId)).toBeNull();
        expect(await expectedFor(tx, ids.signupId, values)).toBeNull();
      },
    );
  });
});
