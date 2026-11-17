import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { accountLanguageTable } from '@/i18n/testing/account-language-table';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { makeId } from '@/lib/ids';
import { SignupAdapter } from './adapter';

// The request Auth.js creates an account in: the callback the signing-in
// browser makes, from the magic link, the six-digit code or a sign-in
// provider. Its Accept-Language, none, or no request at all. And the site's
// DEFAULT_LOCALE as each test sets it: getEnv() parses the environment once.
const request = vi.hoisted(() => ({
  acceptLanguage: null as string | null,
  outsideRequest: false,
  instanceDefault: undefined as string | undefined,
}));
vi.mock('@/i18n/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/server')>()),
  instanceDefaultLocale: () => request.instanceDefault,
}));
vi.mock('next/headers', () => ({
  headers: async () => {
    if (request.outsideRequest) throw new Error('called outside a request');
    return new Headers(
      request.acceptLanguage === null ? {} : { 'accept-language': request.acceptLanguage },
    );
  },
}));

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

const db = getDb();
const adapter = SignupAdapter();
const made = { organizerIds: [] as string[], workspaceIds: [] as string[] };

beforeEach(() => {
  request.acceptLanguage = null;
  request.outsideRequest = false;
  request.instanceDefault = undefined;
});

afterAll(async () => {
  // The workspace takes its member and activity rows with it.
  if (made.workspaceIds.length > 0) {
    await db.delete(workspaces).where(inArray(workspaces.id, made.workspaceIds));
  }
  if (made.organizerIds.length > 0) {
    await db.delete(organizers).where(inArray(organizers.id, made.organizerIds));
  }
});

/** What's stored about an organizer: their language, and the account-creation row's payload. */
async function stored(organizerId: string) {
  const [row] = await db
    .select({ locale: organizers.locale, workspaceId: organizers.defaultWorkspaceId })
    .from(organizers)
    .where(eq(organizers.id, organizerId));
  if (!row?.workspaceId) throw new Error('no account');
  const created = await db
    .select({ payload: activity.payload })
    .from(activity)
    .where(
      and(eq(activity.workspaceId, row.workspaceId), eq(activity.eventType, 'workspace.created')),
    );
  return {
    locale: row.locale,
    workspaceId: row.workspaceId,
    created: created.map((r) => r.payload),
  };
}

/**
 * A first sign-in, as Auth.js makes it: `createUser` with a new email address,
 * from a browser asking for `acceptLanguage`. A provider such as Google sends
 * a name and picture and leaves the email unverified, as Auth.js does there.
 */
async function signUp(acceptLanguage: string | null, via: 'email' | 'provider' = 'email') {
  request.acceptLanguage = acceptLanguage;
  const email = `${makeId('org').toLowerCase()}@example.com`;
  const user = await adapter.createUser(
    via === 'email'
      ? { id: '', email, emailVerified: new Date() }
      : { id: '', email, emailVerified: null, name: 'Pat', image: 'https://example.com/pat.png' },
  );
  made.organizerIds.push(user.id);
  const account = await stored(user.id);
  made.workspaceIds.push(account.workspaceId);
  return { id: user.id, email, ...account };
}

/**
 * A later sign-in to an account that exists, by email, as Auth.js makes it:
 * it finds the account by its address, marks the address verified and starts
 * a session. `createUser` isn't called.
 */
async function signInAgain(email: string, acceptLanguage: string | null) {
  request.acceptLanguage = acceptLanguage;
  const user = await adapter.getUserByEmail(email);
  if (!user) throw new Error('no account');
  await adapter.updateUser!({ id: user.id, emailVerified: new Date() });
  await adapter.createSession!({
    sessionToken: makeId('mem'),
    userId: user.id,
    expires: new Date(Date.now() + 60_000),
  });
  return stored(user.id);
}

describe('SignupAdapter.createUser and the decision table in docs/translating.md (db)', () => {
  it.each(accountLanguageTable())('$label: stores what the row says', async (row) => {
    ship('participant', ['en', 'sv']);
    request.instanceDefault = row.instanceDefault;
    for (const header of row.headers) {
      const account = await signUp(header);
      expect(account.locale, String(header)).toBe(row.stored);
      expect(account.created, String(header)).toEqual([
        row.stored ? { kind: 'personal', locale: row.stored } : { kind: 'personal' },
      ]);
    }
  });
});

describe('SignupAdapter.createUser while only English has shipped (db)', () => {
  beforeEach(shipOnlyEnglish);

  it.each<[string, string | null]>([
    ['an English browser', 'en'],
    ['a regional English browser', 'en-GB'],
    ...OTHER_LANGUAGES.map((other): [string, string] => [
      `a browser asking for ${other} first`,
      `${other},en;q=0.8`,
    ]),
    ['no Accept-Language', null],
  ])('stores no language for %s, and records none', async (_label, header) => {
    const account = await signUp(header);
    expect(account.locale).toBeNull();
    expect(account.created).toEqual([{ kind: 'personal' }]);
  });
});

describe.each(OTHER_LANGUAGES)(
  'SignupAdapter.createUser once %s has shipped to participants (db)',
  (other) => {
    beforeEach(() => {
      ship('participant', ['en', other]);
    });

    it('stores the browser’s top language on the new account, and records it', async () => {
      const account = await signUp(`${other}-SE,en;q=0.8`);
      expect(account.locale).toBe(other);
      expect(account.created).toEqual([{ kind: 'personal', locale: other }]);
    });

    it('stores it for an account made through a sign-in provider too', async () => {
      const account = await signUp(other, 'provider');
      expect(account.locale).toBe(other);
      expect(account.created).toEqual([{ kind: 'personal', locale: other }]);
    });

    it('stores nothing for a browser that asks for English first, which it gets anyway', async () => {
      const account = await signUp(`en-US,${other};q=0.9`);
      expect(account.locale).toBeNull();
      expect(account.created).toEqual([{ kind: 'personal' }]);
    });

    it.each<CatalogLocale>(['en', other])(
      'stores nothing when the site sets a default (%s), so the account follows it',
      async (instanceDefault) => {
        request.instanceDefault = instanceDefault;
        for (const header of [other, 'en', null]) {
          const account = await signUp(header);
          expect(account.locale, String(header)).toBeNull();
          expect(account.created).toEqual([{ kind: 'personal' }]);
        }
      },
    );

    it.each([
      ['a language that hasn’t shipped first', () => `zz,${other};q=0.9,en;q=0.8`],
      ['no Accept-Language', () => null],
      ['the wildcard', () => '*'],
      ['the wildcard ranked first', () => `*,${other};q=0.5`],
      ['a header it can’t read', () => `${other};q=abc`],
      ['junk', () => '<script>'],
    ])('stores no language for %s, and records none', async (_label, header) => {
      const account = await signUp(header());
      expect(account.locale).toBeNull();
      expect(account.created).toEqual([{ kind: 'personal' }]);
    });

    it('stores no language when there is no request to read', async () => {
      request.outsideRequest = true;
      const email = `${makeId('org').toLowerCase()}@example.com`;
      const user = await adapter.createUser({ id: '', email, emailVerified: new Date() });
      made.organizerIds.push(user.id);
      const account = await stored(user.id);
      made.workspaceIds.push(account.workspaceId);
      expect(account.locale).toBeNull();
      expect(account.created).toEqual([{ kind: 'personal' }]);
    });

    it('never changes an account’s language on a later sign-in', async () => {
      const first = await signUp(other);
      const none = await signUp('zz');
      expect(first.locale).toBe(other);
      expect(none.locale).toBeNull();

      // Whatever the browser asks for later, and whatever the site's default
      // has become, each keeps what it stores: one with none follows the
      // default by having none.
      for (const instanceDefault of [undefined, 'en', other]) {
        request.instanceDefault = instanceDefault;
        for (const header of [other, 'en', null]) {
          expect((await signInAgain(first.email, header)).locale).toBe(other);
          expect((await signInAgain(none.email, header)).locale).toBeNull();
        }
      }
      request.instanceDefault = undefined;

      // And one the organizer changed in Settings keeps their choice.
      await db.update(organizers).set({ locale: 'en' }).where(eq(organizers.id, first.id));
      expect((await signInAgain(first.email, other)).locale).toBe('en');

      // Only the account-creation row records a language.
      expect((await stored(first.id)).created).toEqual([{ kind: 'personal', locale: other }]);
    });
  },
);
