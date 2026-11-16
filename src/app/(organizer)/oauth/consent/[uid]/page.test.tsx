// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { CATALOG_LOCALES } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';
import type { ClientDisplay } from '@/oauth/client-display';
import { describeScopes, type Scope } from '@/oauth/scopes';

// Who is signed in, with the language stored on their account and how many
// workspaces they belong to, and the request the consent page shows.
const request = vi.hoisted(() => ({
  session: null as null | {
    organizerId: string;
    email: string;
    locale: string | null;
    memberships: { workspaceId: string }[];
  },
  client: { domain: 'assistant.example.com', name: 'Example Assistant', isUrl: true } as {
    domain: string;
    name: string | null;
    isUrl: boolean;
  },
  scopes: ['signups:read', 'signups:write'] as string[],
  expired: false,
}));
const Gone = vi.hoisted(() => class ConsentUnavailable extends Error {});

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock('@/auth/session', () => ({ getOrganizerSession: async () => request.session }));
vi.mock('@/auth/sign-out', () => ({ signOutOrganizer: vi.fn(), switchOrganizer: vi.fn() }));
vi.mock('@/oauth/consent', () => ({
  ConsentUnavailable: Gone,
  loadConsentContext: async (uid: string) => {
    if (request.expired) throw new Gone();
    return {
      uid,
      client: request.client as ClientDisplay,
      permissions: describeScopes(request.scopes as Scope[]),
    };
  },
}));
// The button as it is, with the label it shows while its submit runs kept on
// it, where a test can read it without a submit running.
vi.mock('@/components/ui/async-submit-button', () => ({
  AsyncSubmitButton: ({ loadingLabel, children }: { loadingLabel: string; children: string }) => (
    <button type="submit" data-loading-label={loadingLabel}>
      {children}
    </button>
  ),
}));
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => {
  const { getTestServerTranslator } = await import('@/i18n/testing/translator');
  return {
    instanceDefaultLocale: () => undefined,
    getServerTranslator: getTestServerTranslator,
  };
});

const { default: ConsentPage, generateMetadata } = await import('./page');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

/** A signed-in organizer in `workspaces` workspaces. */
function signIn(workspaces = 1, locale: string | null = null) {
  request.session = {
    organizerId: 'org_1',
    email: 'pat@example.com',
    locale,
    memberships: Array.from({ length: workspaces }, (_, i) => ({ workspaceId: `ws_${i}` })),
  };
}

async function renderPage(uid = 'abc123') {
  const view = render(await ConsentPage({ params: Promise.resolve({ uid }) }));
  return { frame: view.container.querySelector('[lang]') };
}

/** Matches an element's whole text, as a person reads it. */
function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/** The words of each permission row, without the mark beside it. */
function permissionRows(): string[][] {
  return within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((row) => Array.from(row.querySelectorAll('p'), (p) => p.textContent ?? ''));
}

afterEach(() => {
  cleanup();
  request.session = null;
  request.client = { domain: 'assistant.example.com', name: 'Example Assistant', isUrl: true };
  request.scopes = ['signups:read', 'signups:write'];
  request.expired = false;
});

describe('the consent page', () => {
  it('reads in English word for word as it did before the catalog', async () => {
    signIn();
    request.scopes = ['signups:read', 'signups:write', 'commitments:read', 'offline_access'];
    const { frame } = await renderPage();
    expect(frame).toHaveAttribute('lang', 'en');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(
      exactly('Allow assistant.example.com to use your OpenSignup (test) account?'),
    );
    expect(within(heading).getByText('assistant.example.com')).toHaveClass('break-all');
    const [label, intro] = Array.from(heading.parentElement!.querySelectorAll('p'));
    expect(label).toHaveTextContent(exactly('Connection request'));
    expect(intro).toHaveTextContent(
      exactly(
        'Example Assistant from assistant.example.com wants to connect to your account. Only allow it if you trust assistant.example.com.',
      ),
    );
    expect(within(intro!).getByText('Example Assistant').tagName).toBe('STRONG');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      exactly('It will be able to'),
    );
    expect(permissionRows()).toEqual([
      ['See your signups and their slots'],
      ['Create and edit signups'],
      [
        'See who has signed up, including their names and email addresses',
        'Participants gave these details to you, not to this app. Only approve if you are comfortable with assistant.example.com handling them.',
      ],
    ]);
    expect(screen.getByText(/It acts as you/)).toHaveTextContent(
      exactly("It acts as you (pat@example.com) and can't do anything you couldn't do yourself."),
    );
    expect(screen.getByRole('button', { name: 'Allow' })).toHaveAttribute(
      'data-loading-label',
      'Connecting…',
    );
    expect(screen.getByRole('button', { name: "Don't allow" })).toHaveAttribute(
      'data-loading-label',
      'Declining…',
    );
    const connectedApps = screen.getByRole('link', { name: 'Connected apps' });
    expect(connectedApps).toHaveAttribute('href', '/app/settings/connected-apps');
    expect(connectedApps.parentElement).toHaveTextContent(
      exactly(
        'You can disconnect it at any time from Connected apps. Not you? Sign in as someone else',
      ),
    );
    expect(screen.getByRole('button', { name: 'Sign in as someone else' })).toBeInTheDocument();
    expect(await generateMetadata()).toEqual({
      title: 'Connect an app',
      robots: { index: false },
    });
  });

  it('names the app by its domain alone when its metadata gives no name', async () => {
    signIn();
    request.client = { domain: 'assistant.example.com', name: null, isUrl: true };
    await renderPage();
    expect(screen.getByText(/wants to connect/)).toHaveTextContent(
      exactly(
        'An app from assistant.example.com wants to connect to your account. Only allow it if you trust assistant.example.com.',
      ),
    );
  });

  it('says the people who run the site set up an app registered here', async () => {
    signIn();
    request.client = { domain: 'e2e-client', name: 'E2E test client', isUrl: false };
    await renderPage();
    expect(screen.getByText(/was set up by/)).toHaveTextContent(
      exactly('E2E test client was set up by the people who run this site.'),
    );
    cleanup();
    request.client = { domain: 'e2e-client', name: null, isUrl: false };
    await renderPage();
    expect(screen.getByText(/was set up by/)).toHaveTextContent(
      exactly('e2e-client was set up by the people who run this site.'),
    );
  });

  it('mentions workspaces only to an organizer in more than one', async () => {
    signIn(2);
    await renderPage();
    expect(screen.getByText(/It acts as you/)).toHaveTextContent(
      exactly(
        "It acts as you (pat@example.com) in every workspace you belong to and can't do anything you couldn't do yourself.",
      ),
    );
  });

  it('says a request that has run out has expired, in English as before', async () => {
    signIn();
    request.expired = true;
    const { frame } = await renderPage();
    expect(frame).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      exactly('This connection request has expired'),
    );
    expect(
      screen.getByText(
        'Connection requests are only valid for a few minutes, and only in the browser that started them. Nothing was connected. Go back to the application and start again.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your dashboard' })).toHaveAttribute(
      'href',
      '/app',
    );
    cleanup();
    await renderPage('not a uid');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      exactly('This connection request has expired'),
    );
  });

  it('sends a visitor who isn’t signed in to sign in and back', async () => {
    await expect(renderPage()).rejects.toThrow(
      'redirect /login?callbackUrl=%2Foauth%2Fconsent%2Fabc123',
    );
  });

  describe.each(OTHER_LANGUAGES)('for an organizer whose language is %s', (other) => {
    const ask = (key: string) => `auth.consent.${key} in ${other}`;

    it('stays English while that language hasn’t shipped to organizers', async () => {
      signIn(1, other);
      const { frame } = await renderPage();
      expect(frame).toHaveAttribute('lang', 'en');
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        exactly('It will be able to'),
      );
    });

    it('is in that language once it has shipped to organizers', async () => {
      ship('organizer', ['en', other]);
      signIn(1, other);
      request.scopes = ['signups:read', 'signups:write', 'commitments:read'];
      const { frame } = await renderPage();
      expect(frame).toHaveAttribute('lang', other);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent(exactly(ask('heading')));
      const [label, intro] = Array.from(heading.parentElement!.querySelectorAll('p'));
      expect(label).toHaveTextContent(exactly(ask('request')));
      expect(intro).toHaveTextContent(exactly(ask('fromNamedApp')));
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        exactly(ask('permissions')),
      );
      expect(permissionRows()).toEqual([
        [`auth.scopes.signupsRead in ${other}`],
        [`auth.scopes.signupsWrite in ${other}`],
        [`auth.scopes.commitmentsRead in ${other}`, ask('sensitive')],
      ]);
      expect(screen.getByText(ask('actsAs'))).toBeInTheDocument();
      expect(screen.getByRole('button', { name: ask('allow') })).toHaveAttribute(
        'data-loading-label',
        ask('allowing'),
      );
      expect(screen.getByRole('button', { name: ask('deny') })).toHaveAttribute(
        'data-loading-label',
        ask('denying'),
      );
      expect(
        screen.getByRole('button', { name: ask('switchAccount') }).closest('div'),
      ).toHaveTextContent(exactly(`${ask('disconnect')} ${ask('notYou')} ${ask('switchAccount')}`));
      expect(await generateMetadata()).toEqual({
        title: ask('tabTitle'),
        robots: { index: false },
      });
    });

    it('words both other kinds of app in that language', async () => {
      ship('organizer', ['en', other]);
      signIn(1, other);
      request.client = { domain: 'assistant.example.com', name: null, isUrl: true };
      await renderPage();
      expect(screen.getByText(ask('fromApp'))).toBeInTheDocument();
      cleanup();
      request.client = { domain: 'e2e-client', name: 'E2E test client', isUrl: false };
      await renderPage();
      expect(screen.getByText(ask('setUpBySite'))).toBeInTheDocument();
    });

    it('says a request has expired in that language', async () => {
      ship('organizer', ['en', other]);
      signIn(1, other);
      request.expired = true;
      const { frame } = await renderPage();
      expect(frame).toHaveAttribute('lang', other);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        exactly(ask('expired.heading')),
      );
      expect(screen.getByText(ask('expired.body'))).toBeInTheDocument();
      expect(screen.getByRole('link', { name: ask('expired.dashboard') })).toBeInTheDocument();
    });
  });
});
