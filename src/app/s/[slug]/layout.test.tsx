// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_LOCALES, type CatalogLocale, openGraphLocale } from '@/i18n/config';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { getTranslator } from '@/i18n/translator';
import { rootMetadata } from '../../root-shell';

// The signups stored by slug (deleted ones are left out, as the read skips
// them) and the instance's DEFAULT_LOCALE (none unless a test sets one).
const request = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>>,
  defaultLocale: undefined as string | undefined,
  path: '/s/snack-duty' as string,
}));
// The path the middleware copies into a header, which says whether this is
// a signup's embed.
vi.mock('next/headers', async () => {
  const { SIGNUP_PATH_HEADER } = await import('@/lib/signup-path');
  return { headers: async () => new Headers({ [SIGNUP_PATH_HEADER]: request.path }) };
});
const loadSignupRowBySlug = vi.hoisted(() =>
  vi.fn(async (slug: string) => request.rows[slug] ?? null),
);
vi.mock('@/services/signups.cached', () => ({ loadSignupRowBySlug }));
// Every language from its own catalog, so the footer shows what a visitor
// would read; a message missing from it fails the test.
vi.mock('@/i18n/server', async () => {
  const { getTranslator } = await import('@/i18n/translator');
  return {
    instanceDefaultLocale: () => request.defaultLocale,
    getServerTranslator: (locale: CatalogLocale, namespace: 'common.footer') =>
      getTranslator(locale, namespace, {
        onError: (error) => {
          throw error;
        },
      }),
  };
});
// next/font only works inside a Next build.
vi.mock('@/app/fonts', () => ({ inter: { variable: 'font-inter' } }));
// The instance's own links: none, as this repository ships the list.
vi.mock('@/lib/footer-links', () => ({ FOOTER_LINKS: [] }));

const { default: ParticipantLayout, generateMetadata } = await import('./layout');

const params = { params: Promise.resolve({ slug: 'snack-duty' }) };

function storeSignup(over: Record<string, unknown> = {}) {
  request.rows['snack-duty'] = {
    id: 'sig_1',
    slug: 'snack-duty',
    status: 'open',
    title: 'Snack duty',
    description: 'Bring fruit for the team.',
    settings: {},
    ...over,
  };
}

/**
 * The layout as the server sends it, around a page: the `<html lang>` it
 * wrote, and its body, put into the test's document so it can be queried.
 */
async function renderLayout() {
  const markup = renderToStaticMarkup(
    await ParticipantLayout({ ...params, children: <main>The page</main> }),
  );
  const sent = new DOMParser().parseFromString(markup, 'text/html');
  const body = document.createElement('div');
  body.innerHTML = sent.body.innerHTML;
  document.body.append(body);
  return { lang: sent.documentElement.getAttribute('lang'), body };
}

/** The footer's words, as `locale`'s catalog has them. */
function footerIn(locale: CatalogLocale) {
  const t = getTranslator(locale, 'common.footer', {
    onError: (error) => {
      throw error;
    },
  });
  return {
    label: t('label'),
    links: [t('help'), t('privacy'), t('terms'), t('cookies'), t('source'), t('contact')],
  };
}

function expectFooterIn(body: HTMLElement, locale: CatalogLocale) {
  const { label, links } = footerIn(locale);
  const nav = within(body).getByRole('navigation', { name: label });
  expect(
    within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent),
  ).toEqual(links);
}

afterEach(() => {
  document.body.replaceChildren();
  request.rows = {};
  request.defaultLocale = undefined;
  loadSignupRowBySlug.mockClear();
});

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

describe('the layout of a signup’s pages', () => {
  it.each([{}, { locale: 'en' }])(
    'is English for an English signup (settings %j), as before',
    async (settings) => {
      storeSignup({ settings });
      const { lang, body } = await renderLayout();
      expect(lang).toBe('en');
      expect(within(body).getByRole('main')).toHaveTextContent('The page');
      expectFooterIn(body, 'en');
      // og:locale en_US, and everything else the root layouts share.
      expect(await generateMetadata(params)).toEqual(rootMetadata);
    },
  );

  it.each(OTHER_LANGUAGES)('is in a signup’s language, %s, once it has shipped', async (locale) => {
    ship('participant', ['en', locale]);
    storeSignup({ settings: { locale } });
    const { lang, body } = await renderLayout();
    expect(lang).toBe(locale);
    expectFooterIn(body, locale);
    expect(footerIn(locale).links).not.toEqual(footerIn('en').links);
    // Only the language changes: the share image, site name and words stay.
    expect(await generateMetadata(params)).toEqual({
      ...rootMetadata,
      openGraph: { ...rootMetadata.openGraph, locale: openGraphLocale(locale) },
    });
  });

  it('tells link previews a Swedish signup is sv_SE', async () => {
    ship('participant', ['en', 'sv']);
    storeSignup({ settings: { locale: 'sv' } });
    expect((await generateMetadata(params)).openGraph).toMatchObject({ locale: 'sv_SE' });
  });

  it('reads the signup through the cached row the signup page reads, by its slug', async () => {
    storeSignup({ settings: { locale: 'sv' } });
    await renderLayout();
    await generateMetadata(params);
    // `loadSignupRowBySlug` with the page's own slug, so in a request the
    // page's read answers the layout too and it costs no statement.
    expect(loadSignupRowBySlug.mock.calls).toEqual([['snack-duty'], ['snack-duty']]);
  });

  // Deleted and never-existed both have no row: the read skips deleted ones.
  it('is in the instance’s language when no live signup has the slug', async () => {
    const english = await renderLayout();
    expect(english.lang).toBe('en');
    expectFooterIn(english.body, 'en');
    expect(await generateMetadata(params)).toEqual(rootMetadata);

    for (const locale of OTHER_LANGUAGES) {
      ship('participant', ['en', locale]);
      request.defaultLocale = locale;
      const { lang, body } = await renderLayout();
      expect(lang).toBe(locale);
      expectFooterIn(body, locale);
      expect((await generateMetadata(params)).openGraph).toMatchObject({
        locale: openGraphLocale(locale),
      });
    }
  });

  it.each(OTHER_LANGUAGES)('stays English for a stored %s that hasn’t shipped', async (locale) => {
    shipOnlyEnglish();
    storeSignup({ settings: { locale } });
    const { lang, body } = await renderLayout();
    expect(lang).toBe('en');
    expectFooterIn(body, 'en');
    expect(await generateMetadata(params)).toEqual(rootMetadata);
  });

  it.each(['draft', 'archived'])(
    'gives a %s signup’s language and none of its words',
    async (status) => {
      ship('participant', ['en', 'sv']);
      storeSignup({ status, settings: { locale: 'sv' } });
      const { lang, body } = await renderLayout();
      expect(lang).toBe('sv');
      expect(body.innerHTML).not.toMatch(/Snack duty|Bring fruit/);
      expect(JSON.stringify(await generateMetadata(params))).not.toMatch(/Snack duty|Bring fruit/);
    },
  );

  it('leaves the footer off a signup’s embed, shown inside another website', async () => {
    storeSignup();
    request.path = '/s/snack-duty/embed';
    try {
      const { lang, body } = await renderLayout();
      expect(lang).toBe('en');
      expect(within(body).queryByRole('navigation', { name: footerIn('en').label })).toBeNull();
      expect(within(body).getByRole('main')).toHaveTextContent('The page');
    } finally {
      request.path = '/s/snack-duty';
    }
  });
});
