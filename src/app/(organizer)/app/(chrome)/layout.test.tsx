// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CATALOG_LOCALES } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';
import { INSTANCE_NAME } from '@/lib/site-config';

/** The language stored on the signed-in organizer's account. */
const organizer = vi.hoisted(() => ({ locale: null as string | null }));
vi.mock('@/auth/session', () => ({
  getOrganizerSession: async () => ({ email: 'pat@example.com', locale: organizer.locale }),
  requireOrganizerSession: async () => ({ email: 'pat@example.com', locale: organizer.locale }),
}));
vi.mock('@/auth/sign-out', () => ({ signOutOrganizer: vi.fn() }));
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => undefined,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

const { default: OrganizerLayout, generateMetadata } = await import('./layout');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

afterEach(() => {
  cleanup();
  organizer.locale = null;
});

async function renderLayout() {
  render(await OrganizerLayout({ children: <p>Page</p>, crumbs: null }));
}

describe('the organizer app’s header', () => {
  it('reads as before for an organizer with no language stored, marked English', async () => {
    await renderLayout();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumbs.closest('[lang]')).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('link', { name: 'OpenSignup' })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help');
    const account = screen.getByTitle('Settings');
    expect(account).toHaveAttribute('href', '/app/settings');
    expect(account).toHaveTextContent('Accountpat@example.com');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(await generateMetadata()).toEqual({
      title: { default: 'Dashboard', template: `%s · ${INSTANCE_NAME}` },
    });
  });

  it.each(OTHER_LANGUAGES)('is in the organizer’s language, %s, and marked so', async (other) => {
    ship('organizer', ['en', other]);
    organizer.locale = other;
    await renderLayout();
    const ask = (key: string) => `organizer.chrome.${key} in ${other}`;
    const crumbs = screen.getByRole('navigation', { name: ask('breadcrumb') });
    expect(crumbs.closest('[lang]')).toHaveAttribute('lang', other);
    expect(screen.getByText('Page').closest('[lang]')).toHaveAttribute('lang', other);
    expect(screen.getByRole('link', { name: ask('home') })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ask('help') })).toBeInTheDocument();
    expect(screen.getByTitle(ask('settings'))).toHaveTextContent(ask('account'));
    expect(screen.getByRole('button', { name: ask('signOut') })).toBeInTheDocument();
    expect(await generateMetadata()).toEqual({
      title: { default: ask('tabTitle'), template: `%s · ${INSTANCE_NAME}` },
    });
  });
});
