import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';

// Who is signed in, with the language stored on their account, and the
// instance's settings: unit tests have no DATABASE_URL, so the real getEnv()
// would throw.
const request = vi.hoisted(() => ({
  session: null as null | { locale: string | null },
  env: { DEFAULT_LOCALE: undefined as string | undefined },
}));
const getOrganizerSession = vi.hoisted(() => vi.fn(async () => request.session));
vi.mock('@/auth/session', () => ({ getOrganizerSession }));
vi.mock('@/lib/env', () => ({ getEnv: () => request.env }));
// The `<html>` itself loads the font and the stylesheet, which only Next can;
// what's checked here is the language each layout gives it.
vi.mock('@/app/root-shell', () => ({
  rootMetadata: {},
  rootViewport: {},
  RootShell: ({ children }: { children: React.ReactNode }) => children,
}));

const { default: AppLayout } = await import('./app/layout');
const { default: ConsentLayout } = await import('./oauth/layout');
const { default: SignInLayout } = await import('./login/layout');

type RootLayout = (props: { children: React.ReactNode }) => ReactElement | Promise<ReactElement>;

/** The `<html lang>` a root layout gives its pages. */
async function htmlLang(layout: RootLayout): Promise<string> {
  const shell = (await layout({ children: null })) as ReactElement<{ lang: string }>;
  return shell.props.lang;
}

afterEach(() => {
  request.session = null;
  request.env.DEFAULT_LOCALE = undefined;
  getOrganizerSession.mockClear();
  vi.unstubAllEnvs();
});

describe.each(TEST_LOCALES)('with %s', (other) => {
  beforeEach(shipOnlyEnglish);

  describe.each([
    ['the organizer app', AppLayout],
    ['the consent screen', ConsentLayout],
  ] as const)('%s', (_name, layout) => {
    it('is in the language stored on the signed-in organizer’s account', async () => {
      ship('organizer', ['en', other]);
      request.session = { locale: other };
      expect(await htmlLang(layout)).toBe(other);
      request.session = { locale: 'en' };
      request.env.DEFAULT_LOCALE = other;
      expect(await htmlLang(layout)).toBe('en');
    });

    it('is in the site default, else English, for an organizer with none stored', async () => {
      ship('organizer', ['en', other]);
      request.session = { locale: null };
      expect(await htmlLang(layout)).toBe('en');
      request.env.DEFAULT_LOCALE = other;
      expect(await htmlLang(layout)).toBe(other);
    });

    it('is in the site default, else English, with nobody signed in', async () => {
      ship('organizer', ['en', other]);
      expect(await htmlLang(layout)).toBe('en');
      request.env.DEFAULT_LOCALE = other;
      expect(await htmlLang(layout)).toBe(other);
    });

    it('is English while only English has shipped to organizers, whatever is stored', async () => {
      request.session = { locale: other };
      request.env.DEFAULT_LOCALE = other;
      expect(await htmlLang(layout)).toBe('en');
    });

    // As the screens are, so the e2e specs can see a language that hasn't
    // shipped on the page's `<html>` too.
    it('keeps the e2e run’s unshipped language stored on the account', async () => {
      vi.stubEnv('E2E_UNSHIPPED_LOCALES', other);
      request.session = { locale: other };
      expect(await htmlLang(layout)).toBe(other);
      request.session = null;
      request.env.DEFAULT_LOCALE = other;
      expect(await htmlLang(layout)).toBe('en');
    });
  });

  describe('the sign-in pages', () => {
    it('are in the site default, else English, whoever is signed in', async () => {
      ship('organizer', ['en', other]);
      request.session = { locale: other };
      expect(await htmlLang(SignInLayout)).toBe('en');
      request.env.DEFAULT_LOCALE = other;
      expect(await htmlLang(SignInLayout)).toBe(other);
      request.session = { locale: 'en' };
      expect(await htmlLang(SignInLayout)).toBe(other);
    });

    it('are English while only English has shipped to organizers', async () => {
      vi.stubEnv('E2E_UNSHIPPED_LOCALES', other);
      request.session = { locale: other };
      request.env.DEFAULT_LOCALE = other;
      expect(await htmlLang(SignInLayout)).toBe('en');
    });

    // The check and confirm pages read none, and mustn't start loading one.
    it('read no session', async () => {
      ship('organizer', ['en', other]);
      request.session = { locale: other };
      await htmlLang(SignInLayout);
      expect(getOrganizerSession).not.toHaveBeenCalled();
    });
  });
});
