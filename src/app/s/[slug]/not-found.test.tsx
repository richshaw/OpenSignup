// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ship } from '@/i18n/testing/ship';
import { getTestTranslator } from '@/i18n/testing/translator';
import { SIGNUP_PATH_HEADER } from '@/lib/signup-path';
import EditLinkNotFound from './c/[id]/not-found';
import { gonePage } from './gone-message';
import SignupNotFound from './not-found';

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
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => request.defaultLocale,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

const GONE_PAGE = gonePage(getTestTranslator('participant.gonePage'));

function storeSignup(slug: string, over: Record<string, unknown> = {}) {
  request.rows[slug] = {
    id: 'sig_1',
    slug,
    status: 'open',
    title: 'Snack duty',
    description: 'Bring fruit for the team.',
    settings: { locale: 'sv' },
    ...over,
  };
}

afterEach(() => {
  cleanup();
  request.path = null;
  request.rows = {};
  request.defaultLocale = undefined;
  loadSignupRowBySlug.mockClear();
});

const PAGES = [
  ['the signup page', SignupNotFound, GONE_PAGE.signup, '/s/snack-duty'],
  ['an edit link', EditLinkNotFound, GONE_PAGE.editLink, '/s/snack-duty/c/com_1'],
] as const;

describe('participant not-found pages', () => {
  it.each(PAGES)('%s shows its own message', async (_, Page, copy, path) => {
    request.path = path;
    render(await Page());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.title);
    expect(screen.getByText(copy.body)).toBeInTheDocument();
  });

  it.each(PAGES)(
    '%s is in the language of the signup its path names',
    async (...[, Page, , path]) => {
      ship('participant', ['en', 'sv']);
      storeSignup('snack-duty');
      request.path = path;
      render(await Page());
      expect(screen.getByRole('main')).toHaveAttribute('lang', 'sv');
      // The slug as the signup page reads it, so that page's cached read answers
      // both and the not-found page costs it no statement.
      expect(loadSignupRowBySlug).toHaveBeenCalledWith('snack-duty');
    },
  );

  it.each([
    ['the signup page', SignupNotFound, 'signup', '/s/snack-duty'],
    ['an edit link', EditLinkNotFound, 'editLink', '/s/snack-duty/c/com_1'],
  ] as const)(
    '%s takes its words from the catalog in that language',
    async (_, Page, page, path) => {
      ship('participant', ['en', 'sv']);
      storeSignup('snack-duty');
      request.path = path;
      render(await Page());
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        `participant.gonePage.${page}.title in sv`,
      );
      expect(screen.getByText(`participant.gonePage.${page}.body in sv`)).toBeInTheDocument();
    },
  );

  // Deleted and never-existed both have no row: the read skips deleted ones.
  it.each(PAGES)(
    '%s is in the instance’s language when no live signup has the slug',
    async (...[, Page, , path]) => {
      request.path = path;
      render(await Page());
      expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');

      cleanup();
      ship('participant', ['en', 'sv']);
      request.defaultLocale = 'sv';
      render(await Page());
      expect(screen.getByRole('main')).toHaveAttribute('lang', 'sv');
    },
  );

  it.each([null, '', '/app/settings', '/s/', '/s/Snack-Duty', '/s/snack%00', '/s/a.rsc'])(
    'reads no signup for the path %j, and is in the instance’s language',
    async (path) => {
      ship('participant', ['en', 'sv']);
      storeSignup('snack-duty');
      request.defaultLocale = 'sv';
      request.path = path;
      for (const [, Page] of PAGES) {
        render(await Page());
        expect(screen.getByRole('main')).toHaveAttribute('lang', 'sv');
        cleanup();
      }
      expect(loadSignupRowBySlug).not.toHaveBeenCalled();
    },
  );

  it('falls back for a stored language that hasn’t shipped, as the signup page does', async () => {
    storeSignup('snack-duty');
    request.path = '/s/snack-duty/c/com_1';
    render(await EditLinkNotFound());
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
  });

  it.each(['draft', 'archived'])(
    'takes only the language from a %s signup’s row',
    async (status) => {
      ship('participant', ['en', 'sv']);
      storeSignup('snack-duty', { status });
      for (const [, Page, , path] of PAGES) {
        request.path = path;
        render(await Page());
        expect(screen.getByRole('main')).toHaveAttribute('lang', 'sv');
        expect(document.body).not.toHaveTextContent('Snack duty');
        expect(document.body).not.toHaveTextContent('Bring fruit');
        cleanup();
      }
    },
  );
});
