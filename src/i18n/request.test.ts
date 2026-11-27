import { afterEach, describe, expect, it, vi } from 'vitest';
import { ship } from '@/i18n/testing/ship';
import { SIGNUP_PATH_HEADER } from '@/lib/signup-path';
import { TEST_LOCALES } from './testing/locales';
import { TIME_ZONE } from './time-zone';

// The path the middleware copied into its header (none unless a test sets
// one), the signups stored by slug (deleted ones are left out, as the read
// skips them), and the instance's DEFAULT_LOCALE (none unless a test sets one).
const request = vi.hoisted(() => ({
  path: null as string | null,
  rows: {} as Record<string, Record<string, unknown>>,
  defaultLocale: undefined as string | undefined,
}));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(request.path === null ? {} : { [SIGNUP_PATH_HEADER]: request.path }),
}));
const loadSignupRowBySlug = vi.hoisted(() =>
  vi.fn(async (slug: string) => request.rows[slug] ?? null),
);
vi.mock('@/services/signups.cached', () => ({ loadSignupRowBySlug }));
vi.mock('@/i18n/server', () => ({ instanceDefaultLocale: () => request.defaultLocale }));
// Outside a server render next-intl's getRequestConfig refuses to run; inside
// one it hands back the function it's given, which is what's tested here.
vi.mock('next-intl/server', () => ({ getRequestConfig: <F>(create: F) => create }));

const { default: requestConfig } = await import('./request');
const config = () =>
  (requestConfig as unknown as () => Promise<{ locale: string; timeZone: string }>)();

afterEach(() => {
  request.path = null;
  request.rows = {};
  request.defaultLocale = undefined;
  loadSignupRowBySlug.mockClear();
});

describe('next-intl’s request config', () => {
  it('is English in UTC away from a signup’s pages, with no lookup', async () => {
    for (const locale of TEST_LOCALES) {
      ship('participant', ['en', locale]);
      request.defaultLocale = locale;
      expect(await config()).toEqual({ locale: 'en', timeZone: TIME_ZONE });
    }
    expect(loadSignupRowBySlug).not.toHaveBeenCalled();
  });

  it.each(TEST_LOCALES)(
    'is in the language of the signup a path names, %s, read by its slug',
    async (locale) => {
      ship('participant', ['en', locale]);
      request.rows['snack-duty'] = { slug: 'snack-duty', settings: { locale } };
      for (const path of ['/s/snack-duty', '/s/snack-duty/c/com_1', '/s/snack-duty/unsubscribe']) {
        request.path = path;
        expect(await config()).toEqual({ locale, timeZone: TIME_ZONE });
      }
      // The page's own cached read, by the same slug.
      expect(loadSignupRowBySlug).toHaveBeenCalledWith('snack-duty');
    },
  );

  // Deleted and never-existed both have no row: the read skips deleted ones.
  it('is in the instance’s language for a signup path with no live signup', async () => {
    request.path = '/s/snack-duty';
    expect(await config()).toEqual({ locale: 'en', timeZone: TIME_ZONE });
    for (const locale of TEST_LOCALES) {
      ship('participant', ['en', locale]);
      request.defaultLocale = locale;
      expect(await config()).toEqual({ locale, timeZone: TIME_ZONE });
    }
  });

  it('reads no signup for a path no signup has as its slug', async () => {
    request.path = '/s/Snack-Duty';
    expect(await config()).toEqual({ locale: 'en', timeZone: TIME_ZONE });
    expect(loadSignupRowBySlug).not.toHaveBeenCalled();
  });
});
