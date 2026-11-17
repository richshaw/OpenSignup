// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CATALOG_LOCALES } from '@/i18n/config';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { ok } from '@/lib/result';
import { INSTANCE_NAME } from '@/lib/site-config';

// Who is signed in, and what their workspace holds.
const request = vi.hoisted(() => ({
  session: {
    organizerId: 'org_1',
    email: 'pat@example.com',
    defaultWorkspaceId: 'ws_1' as string | null,
    locale: null as string | null,
  },
  rows: [] as { id: string; title: string; slug: string; status: string; locale?: string | null }[],
}));
vi.mock('@/auth/session', () => ({
  getOrganizerSession: async () => request.session,
  requireOrganizerSession: async () => request.session,
  toActor: () => ({ kind: 'organizer', id: 'org_1' }),
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/services/signups', () => ({
  listSignupSummariesForWorkspace: async () => ok(request.rows),
}));
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => undefined,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

const { default: DashboardPage, generateMetadata } = await import('./page');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

afterEach(() => {
  cleanup();
  request.session.defaultWorkspaceId = 'ws_1';
  request.session.locale = null;
  request.rows = [];
});

async function renderPage() {
  render(await DashboardPage());
}

describe('Your signups', () => {
  it('reads as before with no signups yet', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your signups');
    expect(screen.getByText('No signups yet. Start one below.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New signup' })).toHaveAttribute(
      'href',
      '/app/signups/new',
    );
    expect(
      screen.getByText('Coordinate snacks, carpool, potluck, volunteer shifts, or anything else.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first signup' })).toBeInTheDocument();
    expect(await generateMetadata()).toEqual({ title: 'Your signups' });
  });

  it('counts the signups and words a draft’s row as before', async () => {
    request.rows = [
      { id: 'sig_1', title: 'Bake Sale', slug: 'bake-sale', status: 'open' },
      { id: 'sig_2', title: 'Picnic', slug: 'picnic', status: 'draft' },
    ];
    await renderPage();
    expect(screen.getByText('2 total')).toBeInTheDocument();
    expect(screen.getByText('/s/bake-sale')).toBeInTheDocument();
    expect(screen.getByText('Only you can see this draft')).toBeInTheDocument();
    expect(screen.queryByText('/s/picnic')).not.toBeInTheDocument();
    // Each row's status, in the words it always had.
    expect(screen.getByText('open', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('draft', { exact: true })).toBeInTheDocument();
  });

  it('says so, as before, when the workspace isn’t set up', async () => {
    request.session.defaultWorkspaceId = null;
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      `Welcome to ${INSTANCE_NAME}`,
    );
    expect(
      screen.getByText(
        "Your workspace isn't set up yet. Sign out and back in to finish provisioning.",
      ),
    ).toBeInTheDocument();
  });

  it('leaves the titles of signups in the organizer’s language unmarked', async () => {
    request.rows = [
      { id: 'sig_1', title: 'Bake Sale', slug: 'bake-sale', status: 'open', locale: null },
      { id: 'sig_2', title: 'Picnic', slug: 'picnic', status: 'draft', locale: 'en' },
    ];
    await renderPage();
    expect(screen.getByText('Bake Sale')).not.toHaveAttribute('lang');
    expect(screen.getByText('Picnic')).not.toHaveAttribute('lang');
  });

  // A title is in its signup's language: shown only once that language has
  // shipped to participants, as the signup's own pages show it.
  it.each(OTHER_LANGUAGES)('marks the title of a signup in %s', async (other) => {
    ship('participant', ['en', other]);
    request.rows = [
      { id: 'sig_1', title: 'Bake Sale', slug: 'bake-sale', status: 'open', locale: other },
      { id: 'sig_2', title: 'Picnic', slug: 'picnic', status: 'draft', locale: null },
    ];
    await renderPage();
    expect(screen.getByText('Bake Sale')).toHaveAttribute('lang', other);
    expect(screen.getByText('Picnic')).not.toHaveAttribute('lang');
    // The row's other words are the organizer's.
    expect(screen.getByText('/s/bake-sale').closest('[lang]')).toBeNull();
  });

  it.each(OTHER_LANGUAGES)(
    'leaves a signup stored in %s unmarked until it ships',
    async (other) => {
      shipOnlyEnglish();
      request.rows = [
        { id: 'sig_1', title: 'Bake Sale', slug: 'bake-sale', status: 'open', locale: other },
      ];
      await renderPage();
      expect(screen.getByText('Bake Sale')).not.toHaveAttribute('lang');
    },
  );

  it.each(OTHER_LANGUAGES)(
    'marks English titles for an organizer whose screens are in %s, and not their own language’s',
    async (other) => {
      ship('organizer', ['en', other]);
      ship('participant', ['en', other]);
      request.session.locale = other;
      request.rows = [
        { id: 'sig_1', title: 'Bake Sale', slug: 'bake-sale', status: 'open', locale: null },
        { id: 'sig_2', title: 'Picnic', slug: 'picnic', status: 'draft', locale: other },
      ];
      await renderPage();
      expect(screen.getByText('Bake Sale')).toHaveAttribute('lang', 'en');
      expect(screen.getByText('Picnic')).not.toHaveAttribute('lang');
    },
  );

  it.each(OTHER_LANGUAGES)('is in the organizer’s language, %s', async (other) => {
    ship('organizer', ['en', other]);
    request.session.locale = other;
    request.rows = [{ id: 'sig_2', title: 'Picnic', slug: 'picnic', status: 'draft' }];
    await renderPage();
    const ask = (key: string) => `organizer.dashboard.${key} in ${other}`;
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ask('title'));
    expect(screen.getByText(ask('total'))).toBeInTheDocument();
    expect(screen.getByText(ask('draftOnlyYou'))).toBeInTheDocument();
    expect(screen.getByText(`organizer.status.draft in ${other}`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ask('newSignup') })).toBeInTheDocument();
    expect(await generateMetadata()).toEqual({ title: ask('title') });
  });
});
