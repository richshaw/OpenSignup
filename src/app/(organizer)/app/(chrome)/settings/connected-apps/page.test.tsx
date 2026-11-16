// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { CATALOG_LOCALES } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';
import { getTranslator } from '@/i18n/translator';
import type { ConnectedApp } from '@/oauth/grants';
import { formatGrantDate } from './grant-date';

// Who is signed in, the language stored on their account, and the apps they
// have connected. `realText` swaps the stand-in translator for the real one
// in other languages, for the test that reads the dates.
const request = vi.hoisted(() => ({
  session: { organizerId: 'org_1', email: 'pat@example.com', locale: null as string | null },
  apps: [] as unknown[],
  realText: false,
}));
vi.mock('@/auth/session', () => ({
  getOrganizerSession: async () => request.session,
  requireOrganizerSession: async () => request.session,
  toActor: () => ({ kind: 'organizer', id: 'org_1' }),
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/oauth/grants', () => ({
  listConnectedApps: async () => request.apps,
  revokeConnectedApp: vi.fn(),
}));
vi.mock('@/oauth/instance', () => ({ getProvider: vi.fn() }));
// The button as it is, with the label it shows while a disconnect runs kept
// on it, where a test can read it without one running.
vi.mock('@/components/ui/async-submit-button', () => ({
  AsyncSubmitButton: ({ loadingLabel, children }: { loadingLabel: string; children: string }) => (
    <button type="submit" data-loading-label={loadingLabel}>
      {children}
    </button>
  ),
}));
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`), or with its real
// text where a test asks for it.
vi.mock('@/i18n/server', async () => {
  const { getTestServerTranslator } = await import('@/i18n/testing/translator');
  const { getTranslator } = await import('@/i18n/translator');
  type Namespace = Parameters<typeof getTranslator>[1];
  return {
    instanceDefaultLocale: () => undefined,
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

const { default: ConnectedAppsPage, generateMetadata } = await import('./page');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

/** Noon on a day, in the zone the tests run in, which is the zone dates are written in. */
const noon = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);

const APPROVED = noon(2026, 11, 14);
const LAST_USED = noon(2026, 11, 15);
const EXPIRES = noon(2027, 2, 12);

/** An app the organizer has connected, used and due to expire, unless `overrides` say otherwise. */
function app(overrides: Partial<ConnectedApp> = {}): ConnectedApp {
  return {
    grantId: 'grant_1',
    client: { domain: 'assistant.example.com', name: 'Example Assistant', isUrl: true },
    scopes: ['signups:read', 'signups:write'],
    approvedAt: APPROVED,
    lastUsedAt: LAST_USED,
    expiresAt: EXPIRES,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  request.session.locale = null;
  request.apps = [];
  request.realText = false;
});

async function renderPage(searchParams: Record<string, string> = {}) {
  render(await ConnectedAppsPage({ searchParams: Promise.resolve(searchParams) }));
}

describe('Connected apps', () => {
  it('reads as before with no apps connected', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Connected apps');
    expect(
      screen.getByText(
        'Apps and AI assistants you have allowed to use your account. Each one acts as you, in every workspace you belong to, with the permissions you approved.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No connected apps')).toBeInTheDocument();
    expect(
      screen.getByText(
        'When you connect an AI assistant such as Claude or ChatGPT to your account, it will show up here.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Disconnecting stops an app from getting new access straight away. Access it already holds expires on its own within 15 minutes and cannot be cut short.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(await generateMetadata()).toEqual({ title: 'Connected apps' });
  });

  it('lists each app with its dates and a Disconnect button, as before', async () => {
    request.apps = [
      app(),
      app({
        grantId: 'grant_2',
        client: { domain: 'other.example.com', name: null, isUrl: true },
        lastUsedAt: null,
        expiresAt: null,
      }),
    ];
    await renderPage();
    const [used, unused] = screen.getAllByRole('button', { name: 'Disconnect' }).map((button) => {
      const row = button.closest('li');
      expect(row).not.toBeNull();
      return within(row!);
    });
    expect(used!.getByText('assistant.example.com').parentElement).toHaveTextContent(
      /^assistant\.example\.com · Example Assistant$/,
    );
    expect(used!.getByText('See your signups and their slots')).toBeInTheDocument();
    expect(used!.getByText('Create and edit signups')).toBeInTheDocument();
    expect(
      used!.getByText(
        'Approved 14 Nov 2026 · last used 15 Nov 2026 · expires 12 Feb 2027 unless renewed',
      ),
    ).toBeInTheDocument();
    expect(unused!.getByText('other.example.com').parentElement).toHaveTextContent(
      /^other\.example\.com$/,
    );
    expect(unused!.getByText('Approved 14 Nov 2026 · not used yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Disconnect' })[0]).toHaveAttribute(
      'data-loading-label',
      'Disconnecting…',
    );
  });

  it('says what disconnecting did, as before', async () => {
    await renderPage({ disconnected: '1' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Disconnected. It can no longer get new access, and any access it still holds ends within 15 minutes.',
    );
  });

  it.each(OTHER_LANGUAGES)('is in the organizer’s language, %s', async (other) => {
    ship('organizer', ['en', other]);
    request.session.locale = other;
    request.apps = [app()];
    await renderPage({ disconnected: '1' });
    const ask = (key: string) => `organizer.connectedApps.${key} in ${other}`;
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ask('title'));
    expect(screen.getByText(ask('intro'))).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(ask('disconnected'));
    expect(screen.getByText(ask('dates'))).toBeInTheDocument();
    expect(screen.getByText(`auth.scopes.signupsRead in ${other}`)).toBeInTheDocument();
    expect(screen.getByText(`auth.scopes.signupsWrite in ${other}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ask('disconnect') })).toHaveAttribute(
      'data-loading-label',
      ask('disconnecting'),
    );
    expect(screen.getByText(ask('footnote'))).toBeInTheDocument();
    expect(await generateMetadata()).toEqual({ title: ask('title') });
    cleanup();

    request.apps = [];
    await renderPage();
    expect(screen.getByText(ask('empty.title'))).toBeInTheDocument();
    expect(screen.getByText(ask('empty.body'))).toBeInTheDocument();
  });

  it.each(OTHER_LANGUAGES)('writes the dates in the organizer’s language, %s', async (other) => {
    ship('organizer', ['en', other]);
    request.session.locale = other;
    request.realText = true;
    request.apps = [app()];
    await renderPage();
    const t = getTranslator(other, 'organizer.connectedApps', {
      onError: (error) => {
        throw error;
      },
    });
    expect(
      screen.getByText(
        t('dates', {
          approved: formatGrantDate(APPROVED, other),
          used: 'yes',
          lastUsed: formatGrantDate(LAST_USED, other),
          expiring: 'yes',
          expires: formatGrantDate(EXPIRES, other),
        }),
      ),
    ).toBeInTheDocument();
  });
});
