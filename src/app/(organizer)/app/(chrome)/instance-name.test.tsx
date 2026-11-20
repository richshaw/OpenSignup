import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// A self-hosted site with its own name: the organizer pages must show that
// name, never the upstream project's.
vi.mock('@/lib/site-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/site-config')>()),
  INSTANCE_NAME: 'Acme Signups',
}));
vi.mock('@/auth/session', () => {
  const session = async () => ({
    organizerId: 'org_test',
    email: 'pat@example.com',
    defaultWorkspaceId: null,
    locale: null,
  });
  return {
    getOrganizerSession: session,
    requireOrganizerSession: session,
    toActor: () => ({ kind: 'anonymous' }),
  };
});
vi.mock('@/auth/sign-out', () => ({ signOutOrganizer: async () => {} }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/services/signups', () => ({
  countSignupsForWorkspace: async () => ({}),
  listSignupSummaryPageForWorkspace: async () => ({}),
}));
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => undefined,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

const { default: OrganizerLayout } = await import('./layout');
const { default: DashboardPage } = await import('./page');

describe('organizer pages on a self-hosted site', () => {
  it('names the site in the breadcrumb', async () => {
    const html = renderToStaticMarkup(await OrganizerLayout({ children: null, crumbs: null }));
    expect(html).toContain('Acme Signups');
    expect(html).not.toContain('OpenSignup');
  });

  it('names the site on the no-workspace card', async () => {
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Welcome to Acme Signups');
    expect(html).not.toContain('OpenSignup');
  });
});
