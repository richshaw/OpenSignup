import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { toSignupViewSlots } from '@/app/s/[slug]/signup-view';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { getEnv } from '@/lib/env';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, getPublicSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';

/**
 * Postgres prints a timestamptz in the session's time zone, and the driver
 * hands that text to `new Date()`, which cannot read an offset with seconds in
 * it. Amsterdam's offset had seconds until 1937, so where the database's
 * default zone was Amsterdam's a slot dated 1920-06-01 came back as an Invalid
 * Date: the public page threw on it and the lockout check compared NaN. These
 * give this database that default, as an operator could on their own server,
 * and check that the app's connections read such a slot all the same.
 */

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  actor: Actor;
}

async function setupWorkspace(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `tz-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;
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
  return {
    db,
    workspaceId,
    organizerId,
    actor: {
      kind: 'organizer',
      id: organizerId,
      email,
      workspaceIds: [workspaceId],
      workspaceRoles: { [workspaceId]: 'owner' },
    },
  };
}

describe('database sessions (db)', () => {
  const url = getEnv().DATABASE_URL;
  // Opened before the default changes, and kept to change it back.
  const admin = postgres(url, { max: 1, prepare: false });
  let database = '';
  let fx: Fixture | undefined;

  beforeAll(async () => {
    const [row] = await admin<{ name: string }[]>`select current_database() as name`;
    database = row?.name ?? '';
    await admin`alter database ${admin(database)} set timezone to 'Europe/Amsterdam'`;
    // A database default reaches only connections opened after it is set, so
    // the app's pool starts again with none.
    await globalThis.__signup_pg__?.end();
    globalThis.__signup_pg__ = undefined;
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    try {
      if (fx) {
        await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
        await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
      }
    } finally {
      await admin`alter database ${admin(database)} reset timezone`;
      await admin.end();
    }
  });

  it('opens the app on UTC, whatever the database default', async () => {
    // A connection without the app's settings takes the default, so the
    // default really is Amsterdam's.
    const plain = postgres(url, { max: 1, prepare: false });
    try {
      const [own] = await plain<{ TimeZone: string }[]>`show timezone`;
      expect(own?.TimeZone).toBe('Europe/Amsterdam');
    } finally {
      await plain.end();
    }
    const [app] = await getDb().execute<{ TimeZone: string }>(sql`show timezone`);
    expect(app?.TimeZone).toBe('UTC');
  });

  it('reads a 1920 slot on the public page and in the lockout check', async () => {
    if (!fx) throw new Error('setup failed');
    const created = await createSignup(fx.db, fx.actor, fx.workspaceId, {
      title: 'Village fete',
      description: '',
      tags: [],
      visibility: 'unlisted',
      // A slot that has already started is inside any lockout.
      settings: { lockoutHoursBeforeSlot: 1 },
    });
    if (!created.ok) throw new Error(`createSignup failed: ${created.error.message}`);
    const slot = await addSlot(fx.db, fx.actor, created.value.id, {
      values: { what: 'Bunting', date: '1920-06-01' },
      capacity: 5,
    });
    if (!slot.ok) throw new Error(`addSlot failed: ${slot.error.message}`);
    const published = await publishSignup(fx.db, fx.actor, created.value.id);
    if (!published.ok) throw new Error(`publishSignup failed: ${published.error.message}`);

    // What /s/[slug] does with it.
    const page = await getPublicSignup(fx.db, created.value.slug);
    if (!page.ok) throw new Error(`getPublicSignup failed: ${page.error.message}`);
    const view = toSignupViewSlots(page.value, page.value.committedBySlot);
    // A date-only slot is anchored at noon UTC.
    expect(view.find((s) => s.id === slot.value.id)?.slotAt).toBe('1920-06-01T12:00:00.000Z');

    const r = await commitToSlot(fx.db, slot.value.id, {
      name: 'Pat Example',
      email: 'pat@example.com',
      quantity: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('too close to the slot time to sign up');
  });
});
