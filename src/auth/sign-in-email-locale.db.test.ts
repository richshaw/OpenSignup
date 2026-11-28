import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// next-auth's signIn reads the request's headers and writes cookies through
// next/headers, which only work inside a Next.js request. Each test's request
// comes from an address of its own (`ip`), so the per-IP limit is never what
// stops one.
let ip = '';
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({ host: 'localhost:3000', 'x-forwarded-proto': 'http', 'x-forwarded-for': ip }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('signIn should not redirect when called with redirect: false');
  },
}));

// The instance's DEFAULT_LOCALE, as each test sets it, and English from the
// catalog with any other language answered with where each message was
// asked for ("auth.email.subject in sv"), whatever its catalog holds so far.
const site = vi.hoisted(() => ({ defaultLocale: undefined as string | undefined }));
vi.mock('@/i18n/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/server')>();
  const { getTestServerTranslator } = await import('@/i18n/testing/translator');
  return {
    ...actual,
    getServerTranslator: getTestServerTranslator,
    instanceDefaultLocale: () => site.defaultLocale,
  };
});

// The real lookup, watched, so a test can tell whether it ran.
vi.mock('./sign-in-email-locale', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sign-in-email-locale')>();
  return { signInEmailLocale: vi.fn(actual.signInEmailLocale) };
});

// Auth.js starts the send, then hashes the link's token and asks the adapter
// to store it, and only then waits on the send. A refusal from the rate limit
// that comes before that wait goes unhandled for a moment, which vitest
// reports as an error, and on a busy machine the hash can be the slower. So
// the real rate limit's refusal is passed on once the adapter has been asked
// to store the token (`expectTokenAsked`), when Auth.js is waiting on both,
// as it is on a quiet machine.
const token = vi.hoisted(() => ({ asked: Promise.resolve(), ask: () => {} }));
function expectTokenAsked(): void {
  token.asked = new Promise((resolve) => {
    token.ask = resolve;
  });
}
vi.mock('./adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adapter')>();
  return {
    ...actual,
    SignupAdapter: () => {
      const adapter = actual.SignupAdapter();
      const store = adapter.createVerificationToken!;
      return {
        ...adapter,
        createVerificationToken: (verificationToken: Parameters<typeof store>[0]) => {
          token.ask();
          return store(verificationToken);
        },
      };
    },
  };
});
vi.mock('./magic-link-rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./magic-link-rate-limit')>();
  return {
    ...actual,
    consumeMagicLinkRateLimits: async (
      ...args: Parameters<typeof actual.consumeMagicLinkRateLimits>
    ) => {
      try {
        await actual.consumeMagicLinkRateLimits(...args);
      } catch (refusal) {
        await token.asked;
        throw refusal;
      }
    },
  };
});

import { getDb } from '@/db/client';
import { verificationTokens } from '@/db/schema/auth';
import { magicLinks } from '@/db/schema/magic-links';
import { organizers } from '@/db/schema/organizers';
import { rateLimits } from '@/db/schema/rate-limits';
import { getEmailTransport } from '@/email';
import type { EmailMessage } from '@/email/transport';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { makeId } from '@/lib/ids';
import { RateLimits, chargeRateLimit } from '@/lib/rate-limit';
import { signIn } from './config';
import { MagicLinkRateLimited } from './magic-link-rate-limit';
import { signInEmailLocale } from './sign-in-email-locale';

const db = getDb();
const lookup = vi.mocked(signInEmailLocale);

const addresses: string[] = [];
const ips: string[] = [];

/** A fresh address, with an account storing `locale` when `account` is given. */
async function address(account?: { locale: string | null }): Promise<string> {
  const email = `sign-in-${makeId('org').slice(-10).toLowerCase()}@example.test`;
  addresses.push(email);
  if (account) {
    await db.insert(organizers).values({ id: makeId('org'), email, locale: account.locale });
  }
  return email;
}

/** Asks for a sign-in email to `email`, as the login form does, and returns what was sent. */
async function requestLink(email: string): Promise<EmailMessage | undefined> {
  const send = vi
    .spyOn(getEmailTransport(), 'send')
    .mockResolvedValue({ id: 'test', transport: 'console' });
  try {
    await signIn('nodemailer', { email, redirect: false, redirectTo: '/app' });
    return send.mock.calls[0]?.[0];
  } finally {
    send.mockRestore();
  }
}

beforeEach(() => {
  site.defaultLocale = undefined;
  ip = `2001:db8::${Math.floor(Math.random() * 0xffff).toString(16)}`;
  ips.push(ip);
  lookup.mockClear();
});

afterAll(async () => {
  await db.delete(organizers).where(inArray(organizers.email, addresses));
  await db.delete(magicLinks).where(inArray(magicLinks.email, addresses));
  await db.delete(verificationTokens).where(inArray(verificationTokens.identifier, addresses));
  await db
    .delete(rateLimits)
    .where(
      and(
        eq(rateLimits.bucket, RateLimits.magicLinkPerEmail.bucket),
        inArray(rateLimits.subject, addresses),
      ),
    );
  await db
    .delete(rateLimits)
    .where(
      and(
        eq(rateLimits.bucket, RateLimits.magicLinkPerIp.bucket),
        inArray(rateLimits.subject, ips),
      ),
    );
});

describe('signInEmailLocale', () => {
  it('is English for an address with no account, and for an account with none stored', async () => {
    expect(await signInEmailLocale(db, await address())).toBe('en');
    expect(await signInEmailLocale(db, await address({ locale: null }))).toBe('en');
  });

  describe.each(TEST_LOCALES)('with %s', (locale) => {
    beforeEach(shipOnlyEnglish);

    it('is the language stored on the account, once it has shipped to organizers', async () => {
      const email = await address({ locale });
      expect(await signInEmailLocale(db, email)).toBe('en');
      ship('organizer', ['en', locale]);
      expect(await signInEmailLocale(db, email)).toBe(locale);
    });

    it('does not count it shipped to participants alone', async () => {
      ship('participant', ['en', locale]);
      expect(await signInEmailLocale(db, await address({ locale }))).toBe('en');
    });

    it('is the site default, once shipped, for no account and for an account with none stored', async () => {
      site.defaultLocale = locale;
      const nobody = await address();
      const none = await address({ locale: null });
      expect(await signInEmailLocale(db, nobody)).toBe('en');
      expect(await signInEmailLocale(db, none)).toBe('en');
      ship('organizer', ['en', locale]);
      expect(await signInEmailLocale(db, nobody)).toBe(locale);
      expect(await signInEmailLocale(db, none)).toBe(locale);
    });

    it('lets a stored English win over the site default', async () => {
      site.defaultLocale = locale;
      ship('organizer', ['en', locale]);
      expect(await signInEmailLocale(db, await address({ locale: 'en' }))).toBe('en');
    });
  });

  it('passes over a stored value that is no language it knows', async () => {
    expect(await signInEmailLocale(db, await address({ locale: 'xx' }))).toBe('en');
  });
});

describe('the sign-in email', () => {
  it('is in English, as it always was, for an address with no account', async () => {
    const email = await address();
    const sent = await requestLink(email);
    expect(lookup).toHaveBeenCalledWith(expect.anything(), email);
    expect(sent?.subject).toBe('Sign in to OpenSignup');
    expect(sent?.html).toMatch(/<html[^>]* lang="en"/);
    expect(sent?.text.replace(/\s+/g, ' ')).toContain(
      `SIGN IN TO OPENSIGNUP Click the button below to sign in as ${email}. This link will expire in`,
    );
  });

  it.each(TEST_LOCALES)(
    'is in the language stored on the account, %s, once it has shipped',
    async (locale) => {
      ship('organizer', ['en', locale]);
      const sent = await requestLink(await address({ locale }));
      expect(sent?.subject).toBe(`auth.email.subject in ${locale}`);
      expect(sent?.html).toMatch(new RegExp(`<html[^>]* lang="${locale}"`));
      expect(sent?.text).toContain(`auth.email.signIn in ${locale}`);
    },
  );

  it.each(TEST_LOCALES)(
    'is in the site default, %s, for an address with no account',
    async (locale) => {
      site.defaultLocale = locale;
      ship('organizer', ['en', locale]);
      const sent = await requestLink(await address());
      expect(sent?.subject).toBe(`auth.email.subject in ${locale}`);
      expect(sent?.html).toMatch(new RegExp(`<html[^>]* lang="${locale}"`));
    },
  );

  // A flood of requests is refused before anything about the address is read.
  it('reads nothing about the address once the rate limit refuses the request', async () => {
    const email = await address({ locale: null });
    for (let i = 0; i < RateLimits.magicLinkPerEmail.max; i += 1) {
      await chargeRateLimit(db, RateLimits.magicLinkPerEmail, email);
    }
    const send = vi
      .spyOn(getEmailTransport(), 'send')
      .mockResolvedValue({ id: 'test', transport: 'console' });
    expectTokenAsked();
    try {
      await expect(
        signIn('nodemailer', { email, redirect: false, redirectTo: '/app' }),
      ).rejects.toBeInstanceOf(MagicLinkRateLimited);
      expect(lookup).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    } finally {
      send.mockRestore();
    }
  });
});
