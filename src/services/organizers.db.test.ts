import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { organizers } from '@/db/schema/organizers';
import { type Audience, SHIPPED } from '@/i18n/config';
import { ServiceException } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { updateOrganizerLocale } from './organizers';

// Only English has shipped today. The tests that need a second language ship
// Swedish by changing the list itself, so the service's own check sees it.
const asShippedToday = { ...SHIPPED };
function ship(audience: Audience, locales: string[]) {
  (SHIPPED as Record<Audience, readonly string[]>)[audience] = locales;
}

const db = getDb();
const mine = makeId('org');
const theirs = makeId('org');

/** An organizer actor, as the session or a token builds one. No workspaces: the setting is the organizer's own. */
function organizer(id: string): Actor {
  return {
    kind: 'organizer',
    id,
    email: `${id.toLowerCase()}@example.com`,
    workspaceIds: [],
    workspaceRoles: {},
  };
}

async function storedLocale(id: string): Promise<string | null | undefined> {
  const [row] = await db
    .select({ locale: organizers.locale })
    .from(organizers)
    .where(eq(organizers.id, id));
  return row?.locale;
}

async function store(id: string, locale: string | null) {
  await db.update(organizers).set({ locale }).where(eq(organizers.id, id));
}

beforeAll(async () => {
  await db.insert(organizers).values([
    { id: mine, email: `${mine.toLowerCase()}@example.com` },
    { id: theirs, email: `${theirs.toLowerCase()}@example.com` },
  ]);
});

afterAll(async () => {
  await db.delete(organizers).where(inArray(organizers.id, [mine, theirs]));
});

afterEach(async () => {
  Object.assign(SHIPPED, asShippedToday);
  await store(mine, null);
  await store(theirs, null);
});

describe('updateOrganizerLocale (db)', () => {
  it('stores a shipped language on the organizer and says which', async () => {
    expect(await storedLocale(mine)).toBeNull();
    expect(await updateOrganizerLocale(db, organizer(mine), 'en')).toEqual({
      ok: true,
      value: { locale: 'en' },
    });
    expect(await storedLocale(mine)).toBe('en');
  });

  it('stores a second language once it has shipped to participants', async () => {
    ship('participant', ['en', 'sv']);
    expect(await updateOrganizerLocale(db, organizer(mine), 'sv')).toEqual({
      ok: true,
      value: { locale: 'sv' },
    });
    expect(await storedLocale(mine)).toBe('sv');
  });

  it('changes only the acting organizer’s own language', async () => {
    await store(theirs, 'en');
    ship('participant', ['en', 'sv']);

    expect((await updateOrganizerLocale(db, organizer(mine), 'sv')).ok).toBe(true);
    expect(await storedLocale(mine)).toBe('sv');
    expect(await storedLocale(theirs)).toBe('en');
  });

  it('refuses a language that hasn’t shipped, or none, and keeps the stored one', async () => {
    await store(mine, 'en');
    // Swedish has a name but hasn't shipped; the rest name no language as
    // the list writes them. Organizers only ever pick from that list.
    for (const sent of ['sv', 'xx', 'EN', 'en-GB', '', ' en', null, undefined, 1, ['en']]) {
      const result = await updateOrganizerLocale(db, organizer(mine), sent);
      expect(result.ok, `${JSON.stringify(sent)} was accepted`).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({ code: 'invalid_input', field: 'locale' });
      }
    }
    expect(await storedLocale(mine)).toBe('en');
  });

  it('refuses anyone who isn’t an organizer before it writes anything', async () => {
    await store(mine, 'en');
    const strangers: Actor[] = [
      { kind: 'anonymous' },
      { kind: 'participant', signupId: 'sig_x', participantId: 'par_x', commitmentId: 'com_x' },
    ];
    for (const actor of strangers) {
      const refused = updateOrganizerLocale(db, actor, 'en');
      await expect(refused).rejects.toBeInstanceOf(ServiceException);
      await expect(refused).rejects.toMatchObject({ serviceError: { code: 'unauthorized' } });
    }
    expect(await storedLocale(mine)).toBe('en');
    expect(await storedLocale(theirs)).toBeNull();
  });

  it('says not_found for an organizer whose account has gone', async () => {
    const result = await updateOrganizerLocale(db, organizer(makeId('org')), 'en');
    expect(result).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });
});
