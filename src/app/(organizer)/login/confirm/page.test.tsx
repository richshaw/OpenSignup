// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { INSTANCE_NAME } from '@/lib/site-config';

// The instance's DEFAULT_LOCALE (none unless a test sets one).
const request = vi.hoisted(() => ({ defaultLocale: undefined as string | undefined }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ AUTH_URL: 'http://localhost:3000' }) }));
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => {
  const { getTestServerTranslator } = await import('@/i18n/testing/translator');
  return {
    instanceDefaultLocale: () => request.defaultLocale,
    getServerTranslator: getTestServerTranslator,
  };
});

const next =
  'http://localhost:3000/api/auth/callback/nodemailer?token=not-a-real-token&email=pat%40example.com';

async function renderPage(link = next) {
  const { default: ConfirmLoginPage } = await import('./page');
  const view = render(await ConfirmLoginPage({ searchParams: Promise.resolve({ next: link }) }));
  return { frame: view.container.querySelector('[lang]') };
}

async function metadata() {
  const { generateMetadata } = await import('./page');
  return generateMetadata();
}

beforeEach(() => {
  request.defaultLocale = undefined;
});
afterEach(cleanup);

describe('ConfirmLoginPage', () => {
  // Every emailed sign-in link lands here, and the page shows the person's
  // email address, so it carries the same footer as the login page.
  it('links to the privacy policy and terms in the site footer', async () => {
    const { default: ConfirmLoginPage } = await import('./page');
    render(await ConfirmLoginPage({ searchParams: Promise.resolve({ next }) }));

    expect(screen.getByText('pat@example.com')).toBeInTheDocument();
    const footer = within(screen.getByRole('navigation', { name: 'Footer' }));
    expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });

  it('is in English, word for word as it read before the catalog', async () => {
    const { frame } = await renderPage();
    expect(frame).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      `Sign in to ${INSTANCE_NAME}`,
    );
    const line = screen.getByText(/^Click the button below/);
    expect(line).toHaveTextContent('Click the button below to sign in as pat@example.com.');
    expect(within(line).getByText('pat@example.com').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'Sign in →' })).toHaveAttribute('href', next);
    expect(screen.getByRole('link', { name: 'Use a different email' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(await metadata()).toEqual({ title: 'Sign in', robots: { index: false } });
  });

  it('asks plainly when the link names no address', async () => {
    await renderPage(next.replace('&email=pat%40example.com', ''));
    expect(screen.getByText('Click the button below to sign in.')).toBeInTheDocument();
  });

  describe.each(TEST_LOCALES)('with DEFAULT_LOCALE=%s', (other) => {
    beforeEach(shipOnlyEnglish);

    it('stays English while that language hasn’t shipped to organizers', async () => {
      request.defaultLocale = other;
      const { frame } = await renderPage();
      expect(frame).toHaveAttribute('lang', 'en');
      expect(screen.getByRole('link', { name: 'Sign in →' })).toBeInTheDocument();
    });

    it('is in that language once it has shipped to organizers', async () => {
      ship('organizer', ['en', other]);
      request.defaultLocale = other;
      const { frame } = await renderPage();
      expect(frame).toHaveAttribute('lang', other);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        `auth.heading in ${other}`,
      );
      expect(screen.getByText(`auth.confirm.bodyAs in ${other}`)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: `auth.confirm.signIn in ${other}` })).toHaveAttribute(
        'href',
        next,
      );
      expect(
        screen.getByRole('link', { name: `auth.confirm.differentEmail in ${other}` }),
      ).toBeInTheDocument();
      expect(await metadata()).toEqual({
        title: `auth.tabTitle in ${other}`,
        robots: { index: false },
      });
      cleanup();
      await renderPage(next.replace('&email=pat%40example.com', ''));
      expect(screen.getByText(`auth.confirm.body in ${other}`)).toBeInTheDocument();
    });
  });
});
