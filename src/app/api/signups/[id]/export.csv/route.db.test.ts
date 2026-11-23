import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { CATALOG_LOCALES } from '@/i18n/config';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { makeId } from '@/lib/ids';
import { csvSeparator } from '@/lib/responses-csv';
import type { Actor } from '@/lib/policy';
import { commitToSlot, removeCommitment } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { GET } from './route';

// The route reads the organizer from the session cookie. The test hands it one
// directly instead of going through Auth.js. Their session is read from the
// database as the cookie's would be, so it carries the language stored on
// their account.
const session = vi.hoisted(() => ({ actor: { kind: 'anonymous' } as Actor }));
vi.mock('@/auth/session', async () => {
  const { loadOrganizerSessionById } = await import('@/auth/organizer-session');
  const { getDb } = await import('@/db/client');
  return {
    requireActor: async () => session.actor,
    getOrganizerSession: async () =>
      session.actor.kind === 'organizer'
        ? loadOrganizerSessionById(getDb(), session.actor.id)
        : null,
  };
});

// English comes from the catalog. Any other language answers with the key it
// was asked for and the language, so the test sees which words were asked for
// in it, whatever its catalog holds so far.
vi.mock('@/i18n/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/server')>()),
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  signupId: string;
  slug: string;
}

/**
 * A published signup with a date field and a text field, one slot, Pat signed
 * up to it, and Sam signed up and then taken off by the organizer.
 */
async function setupFixture(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const wsSlug = `csv-${workspaceId.slice(-8).toLowerCase()}`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email: `${wsSlug}@example.test` });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug: wsSlug,
      name: 'Export CSV Route Test',
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

  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${wsSlug}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  session.actor = actor;

  const created = await createSignup(
    db,
    actor,
    workspaceId,
    { title: 'Snack duty' },
    {
      template: {
        id: 'export-csv-test',
        fields: [
          {
            ref: 'day',
            label: 'Day',
            fieldType: 'date',
            sortOrder: 0,
            config: { fieldType: 'date' },
          },
          {
            ref: 'what',
            label: 'What',
            fieldType: 'text',
            sortOrder: 1,
            config: { fieldType: 'text', maxLength: 200 },
          },
        ],
        slots: [],
      },
    },
  );
  if (!created.ok) throw new Error(created.error.message);
  const signupId = created.value.id;
  const slot = await addSlot(db, actor, signupId, {
    values: { day: '2030-11-14', what: 'Fruit and water' },
    capacity: 5,
  });
  if (!slot.ok) throw new Error(slot.error.message);
  const pub = await publishSignup(db, actor, signupId);
  if (!pub.ok) throw new Error(pub.error.message);

  const pat = await commitToSlot(db, slot.value.id, {
    name: 'Pat Example',
    email: `pat-${wsSlug}@example.test`,
    quantity: 1,
  });
  if (!pat.ok) throw new Error(pat.error.message);
  const sam = await commitToSlot(db, slot.value.id, {
    name: 'Sam Example',
    email: `sam-${wsSlug}@example.test`,
    quantity: 2,
    notes: 'Bringing cups',
  });
  if (!sam.ok) throw new Error(sam.error.message);
  const removed = await removeCommitment(db, actor, sam.value.commitment.id, signupId);
  if (!removed.ok) throw new Error(removed.error.message);

  return { db, workspaceId, organizerId, signupId, slug: created.value.slug };
}

describe('GET /api/signups/[id]/export.csv (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupFixture();
  });

  afterAll(async () => {
    if (!fx) return; // setup failed: let its own error show
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  afterEach(async () => {
    if (fx) await storeLanguage(null);
  });

  /** Stores `locale` on the organizer's account, as account Settings would. */
  async function storeLanguage(locale: string | null) {
    await fx.db.update(organizers).set({ locale }).where(eq(organizers.id, fx.organizerId));
  }

  async function download(headers: Record<string, string> = {}) {
    const req = new NextRequest(`http://localhost/api/signups/${fx.signupId}/export.csv`, {
      headers,
    });
    const res = await GET(req, { params: Promise.resolve({ id: fx.signupId }) });
    expect(res.status).toBe(200);
    return res;
  }

  it('writes a column per field and says who the organizer removed', async () => {
    const req = new NextRequest(`http://localhost/api/signups/${fx.signupId}/export.csv`);
    const res = await GET(req, { params: Promise.resolve({ id: fx.signupId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="${fx.slug}-responses.csv"`,
    );

    const [header, pat, sam, ...rest] = (await res.text()).replace(/^﻿/, '').split('\n');
    expect(header).toBe('Day,What,Name,Email,Status,Spots,Notes,Signed up');
    const wsSlug = `csv-${fx.workspaceId.slice(-8).toLowerCase()}`;
    expect(pat).toMatch(
      new RegExp(
        `^2030-11-14,Fruit and water,Pat Example,pat-${wsSlug}@example\\.test,confirmed,1,,\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z$`,
      ),
    );
    expect(sam).toMatch(
      new RegExp(
        `^2030-11-14,Fruit and water,Sam Example,sam-${wsSlug}@example\\.test,removed,2,Bringing cups,`,
      ),
    );
    expect(rest).toEqual([]);
  });

  it.each(CATALOG_LOCALES.filter((locale) => locale !== 'en'))(
    'names its columns and statuses in the language stored on the account, %s',
    async (locale) => {
      ship('organizer', ['en', locale]);
      await storeLanguage(locale);
      const say = (key: string) => `organizer.responses.${key} in ${locale}`;
      // Every test language writes decimals with a comma, so Excel there
      // splits on semicolons.
      const separator = csvSeparator(locale);
      expect(separator).toBe(';');

      // The browser asks for English: the account decides, not the request.
      const res = await download({ 'accept-language': 'en' });
      expect(res.headers.get('content-disposition')).toBe(
        `attachment; filename="${say('csv.fileName')}"`,
      );
      const [header, pat, sam] = (await res.text()).replace(/^\uFEFF/, '').split('\n');
      expect(header).toBe(
        [
          'Day',
          'What',
          say('csv.name'),
          say('csv.email'),
          say('csv.status'),
          say('csv.spots'),
          say('csv.notes'),
          say('csv.signedUp'),
        ].join(separator),
      );
      // Values and names as stored, the status in the organizer's language.
      expect(pat).toMatch(/^2030-11-14;Fruit and water;Pat Example;/);
      expect(pat?.split(separator)[4]).toBe(say('status.confirmed'));
      expect(sam).toMatch(/^2030-11-14;Fruit and water;Sam Example;/);
      expect(sam?.split(separator)[4]).toBe(say('status.removed'));
    },
  );

  it('stays in English for a stored language that hasn’t shipped, whatever the browser asks', async () => {
    shipOnlyEnglish();
    await storeLanguage('sv');
    const res = await download({ 'accept-language': 'sv' });
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="${fx.slug}-responses.csv"`,
    );
    const [header, , sam] = (await res.text()).replace(/^\uFEFF/, '').split('\n');
    expect(header).toBe('Day,What,Name,Email,Status,Spots,Notes,Signed up');
    expect(sam?.split(',')[4]).toBe('removed');
  });
});
