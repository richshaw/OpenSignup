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
import { extractSlotAt } from '@/services/slot-fields';
import { listFieldsForSignup } from '@/services/slot-fields';

/**
 * Migration 0005 rewrites settings and slot_at in SQL, duplicating the rule
 * that lives in TypeScript (`resolveAnchorRef`, `extractSlotAt`). This runs
 * the migration's statements against hand-built legacy rows inside a
 * transaction that is always rolled back, and checks the SQL lands exactly
 * where the TypeScript would.
 */
const MIGRATION = readFileSync(
  path.resolve(__dirname, 'migrations/0005_reminders_day_before.sql'),
  'utf8',
)
  .split('--> statement-breakpoint')
  .map((stmt) => stmt.trim())
  .filter((stmt) => stmt.length > 0);

class Rollback extends Error {}

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
}

async function setupWorkspace(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `mig5-${workspaceId.slice(-8).toLowerCase()}`;
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
  /** Slot values; slot_at is inserted as NULL so the migration has to produce it. */
  slotValues: Record<string, unknown>;
}

async function insertLegacy(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  fx: Fixture,
  spec: LegacySignup,
): Promise<{ signupId: string; slotId: string }> {
  const signupId = makeId('sig');
  const slotId = makeId('slot');
  await tx.insert(signups).values({
    id: signupId,
    workspaceId: fx.workspaceId,
    organizerId: fx.organizerId,
    slug: `mig5-${signupId.slice(-10).toLowerCase()}`,
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
    slotAt: null,
    status: 'open',
  });
  return { signupId, slotId };
}

describe('migration 0005_reminders_day_before (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await fx.db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, fx.workspaceId));
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  /**
   * Runs `body` after the migration statements, all inside one transaction
   * that is rolled back at the end, so nothing this test builds survives.
   */
  async function withMigrated(
    seed: (tx: Parameters<Parameters<Db['transaction']>[0]>[0]) => Promise<void>,
    body: (tx: Parameters<Parameters<Db['transaction']>[0]>[0]) => Promise<void>,
  ): Promise<void> {
    await expect(
      fx.db.transaction(async (tx) => {
        await seed(tx);
        for (const stmt of MIGRATION) await tx.execute(sql.raw(stmt));
        await body(tx);
        throw new Rollback('rollback');
      }),
    ).rejects.toBeInstanceOf(Rollback);
  }

  async function settingsOf(tx: Parameters<Parameters<Db['transaction']>[0]>[0], id: string) {
    const [row] = await tx
      .select({ settings: signups.settings })
      .from(signups)
      .where(eq(signups.id, id));
    return (row?.settings ?? {}) as Record<string, unknown>;
  }

  async function slotAtOf(tx: Parameters<Parameters<Db['transaction']>[0]>[0], id: string) {
    const [row] = await tx.select({ slotAt: slots.slotAt }).from(slots).where(eq(slots.id, id));
    return row?.slotAt ?? null;
  }

  it('drops reminderLeadHours and pins the sole date field, leaving the rest of settings alone', async () => {
    let ids!: { signupId: string; slotId: string };
    await withMigrated(
      async (tx) => {
        ids = await insertLegacy(tx, fx, {
          settings: { reminderLeadHours: 48, sendReminders: false, groupByFieldRefs: [] },
          fields: [
            { ref: 'what', fieldType: 'text', sortOrder: 0 },
            { ref: 'date', fieldType: 'date', sortOrder: 1 },
          ],
          slotValues: { what: 'Cake', date: '2026-06-15' },
        });
      },
      async (tx) => {
        const s = await settingsOf(tx, ids.signupId);
        expect(s).toEqual({
          sendReminders: false,
          groupByFieldRefs: [],
          reminderFromFieldRef: 'date',
        });
        expect((await slotAtOf(tx, ids.slotId))?.toISOString()).toBe('2026-06-15T00:00:00.000Z');
      },
    );
  });

  it('pins the first date field by sort order and pairs its time field, exactly as extractSlotAt does', async () => {
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
          settings: {},
          fields: [
            { ref: 'return', fieldType: 'date', sortOrder: 2 },
            { ref: 'return-time', fieldType: 'time', sortOrder: 3 },
            { ref: 'depart', fieldType: 'date', sortOrder: 0 },
            { ref: 'depart-time', fieldType: 'time', sortOrder: 1 },
          ],
          slotValues: values,
        });
      },
      async (tx) => {
        const s = await settingsOf(tx, ids.signupId);
        expect(s['reminderFromFieldRef']).toBe('depart');
        const fields = await listFieldsForSignup(tx, ids.signupId);
        const expected = extractSlotAt(s, fields, values);
        expect(expected?.toISOString()).toBe('2026-07-01T06:15:00.000Z');
        expect((await slotAtOf(tx, ids.slotId))?.getTime()).toBe(expected?.getTime());
      },
    );
  });

  it('re-points a dangling ref and clears one on a signup with no date field', async () => {
    let dangling!: { signupId: string; slotId: string };
    let dateless!: { signupId: string; slotId: string };
    await withMigrated(
      async (tx) => {
        dangling = await insertLegacy(tx, fx, {
          settings: { reminderFromFieldRef: 'gone' },
          fields: [{ ref: 'when', fieldType: 'date', sortOrder: 0 }],
          slotValues: { when: '2026-08-01' },
        });
        dateless = await insertLegacy(tx, fx, {
          settings: { reminderFromFieldRef: 'gone', sendReminders: true },
          fields: [{ ref: 'what', fieldType: 'text', sortOrder: 0 }],
          slotValues: { what: 'Chairs' },
        });
      },
      async (tx) => {
        expect((await settingsOf(tx, dangling.signupId))['reminderFromFieldRef']).toBe('when');
        expect((await slotAtOf(tx, dangling.slotId))?.toISOString()).toBe(
          '2026-08-01T00:00:00.000Z',
        );
        expect(await settingsOf(tx, dateless.signupId)).toEqual({ sendReminders: true });
        expect(await slotAtOf(tx, dateless.slotId)).toBeNull();
      },
    );
  });

  it('respects a ref that already names a date field, even when it is not the first', async () => {
    let ids!: { signupId: string; slotId: string };
    await withMigrated(
      async (tx) => {
        ids = await insertLegacy(tx, fx, {
          settings: { reminderFromFieldRef: 'second' },
          fields: [
            { ref: 'first', fieldType: 'date', sortOrder: 0 },
            { ref: 'second', fieldType: 'date', sortOrder: 1 },
          ],
          slotValues: { first: '2026-09-01', second: '2026-09-02' },
        });
        // Not re-pinned, so not recomputed either: a NULL slot_at on a row the
        // migration has no reason to touch stays NULL (the services own it).
      },
      async (tx) => {
        expect((await settingsOf(tx, ids.signupId))['reminderFromFieldRef']).toBe('second');
        expect(await slotAtOf(tx, ids.slotId)).toBeNull();
      },
    );
  });

  it('stores NULL rather than a rolled-over date for an impossible legacy value', async () => {
    let ids!: { signupId: string; slotId: string };
    await withMigrated(
      async (tx) => {
        ids = await insertLegacy(tx, fx, {
          settings: {},
          fields: [{ ref: 'when', fieldType: 'date', sortOrder: 0 }],
          slotValues: { when: '2026-02-30' },
        });
      },
      async (tx) => {
        expect((await settingsOf(tx, ids.signupId))['reminderFromFieldRef']).toBe('when');
        expect(await slotAtOf(tx, ids.slotId)).toBeNull();
      },
    );
  });
});
