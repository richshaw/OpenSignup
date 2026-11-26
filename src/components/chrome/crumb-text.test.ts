import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { ship } from '@/i18n/testing/ship';

/** Who is signed in: nobody, or an organizer storing a language or none. */
const request = vi.hoisted(() => ({ session: null as { locale: string | null } | null }));
vi.mock('@/auth/session', () => ({ getOrganizerSession: async () => request.session }));
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => undefined,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

const { crumbTranslator } = await import('./crumb-text');

afterEach(() => {
  request.session = null;
});

describe('crumbTranslator', () => {
  it('gives nothing to a visitor, whom the page sends to sign in', async () => {
    expect(await crumbTranslator()).toBeNull();
  });

  it('words the crumbs as before for an organizer with no language stored', async () => {
    request.session = { locale: null };
    const t = (await crumbTranslator())!;
    expect([t('settings'), t('connectedApps'), t('newSignup')]).toEqual([
      'Settings',
      'Connected apps',
      'New signup',
    ]);
  });

  it.each(TEST_LOCALES)('words them in the organizer’s language, %s', async (other) => {
    ship('organizer', ['en', other]);
    request.session = { locale: other };
    const t = (await crumbTranslator())!;
    expect(t('settings')).toBe(`organizer.crumbs.settings in ${other}`);
  });
});
