// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CATALOG_LOCALES } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';
import { formatDuration } from '@/lib/format-duration';

// The instance's DEFAULT_LOCALE and how long its links last. `realText`
// swaps the stand-in translator for the real one in other languages, for the
// test that reads the link's lifetime.
const request = vi.hoisted(() => ({
  defaultLocale: undefined as string | undefined,
  maxAgeMinutes: 60,
  realText: false,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/auth/magic-link-expiry', () => ({
  getMagicLinkMaxAgeMinutes: () => request.maxAgeMinutes,
}));
vi.mock('@/i18n/server', async () => {
  const { getTestServerTranslator } = await import('@/i18n/testing/translator');
  const { getTranslator } = await import('@/i18n/translator');
  type Namespace = Parameters<typeof getTranslator>[1];
  return {
    instanceDefaultLocale: () => request.defaultLocale,
    getServerTranslator: (locale: string, namespace: Namespace) =>
      request.realText
        ? getTranslator(locale as 'en', namespace, {
            onError: (error) => {
              throw error;
            },
          })
        : getTestServerTranslator(locale, namespace),
  };
});

const { default: CheckEmailPage, generateMetadata } = await import('./page');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

async function renderPage() {
  const view = render(await CheckEmailPage({ searchParams: Promise.resolve({}) }));
  return { frame: view.container.querySelector('[lang]') };
}

beforeEach(() => {
  request.defaultLocale = undefined;
  request.maxAgeMinutes = 60;
  request.realText = false;
});
afterEach(cleanup);

describe('the check-your-email page', () => {
  it('is in English, word for word as it read before the catalog', async () => {
    request.maxAgeMinutes = 90;
    const { frame } = await renderPage();
    expect(frame).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check your email');
    expect(
      screen.getByText(
        'We sent a sign-in link to your inbox. Click it to continue. The link expires in 1 hour 30 minutes. This page will move on by itself once you have signed in.',
      ),
    ).toBeInTheDocument();
    expect(await generateMetadata()).toEqual({
      title: 'Check your email',
      robots: { index: false },
    });
  });

  describe.each(OTHER_LANGUAGES)('with DEFAULT_LOCALE=%s', (other) => {
    it('stays English while that language hasn’t shipped to organizers', async () => {
      request.defaultLocale = other;
      const { frame } = await renderPage();
      expect(frame).toHaveAttribute('lang', 'en');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check your email');
    });

    it('is in that language once it has shipped to organizers', async () => {
      ship('organizer', ['en', other]);
      request.defaultLocale = other;
      const { frame } = await renderPage();
      expect(frame).toHaveAttribute('lang', other);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        `auth.check.heading in ${other}`,
      );
      expect(screen.getByText(`auth.check.body in ${other}`)).toBeInTheDocument();
      expect(await generateMetadata()).toEqual({
        title: `auth.check.tabTitle in ${other}`,
        robots: { index: false },
      });
    });

    it('says how long the link lasts in that language', async () => {
      ship('organizer', ['en', other]);
      request.defaultLocale = other;
      request.realText = true;
      request.maxAgeMinutes = 90;
      await renderPage();
      const lifetime = formatDuration(90, other);
      expect(lifetime).not.toBe(formatDuration(90, 'en'));
      expect(screen.getByText(new RegExp(lifetime))).toBeInTheDocument();
    });
  });
});
