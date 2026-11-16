// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { type Audience, SHIPPED } from '@/i18n/config';

// Only English has shipped to participants today. The tests that need a
// choice ship a second language by changing the list itself, so the form and
// `signupLocale` both see it.
const shippedToday = [...SHIPPED.participant];
function ship(locales: string[]) {
  (SHIPPED as Record<Audience, readonly string[]>).participant = locales;
}
// Unit tests have no server environment. The instance sets no language
// unless a test sets one.
const instance = vi.hoisted(() => ({ defaultLocale: undefined as string | undefined }));
vi.mock('@/i18n/server', () => ({ instanceDefaultLocale: () => instance.defaultLocale }));

// The signup as the page loads it, and what the page needs around it: a
// session, the view it records and the server actions, which need a database.
const stored = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({}),
  toActor: () => ({ kind: 'anonymous' }),
}));
vi.mock('@/services/signups.cached', () => ({
  loadSignupForOrganizer: async () => ({
    ok: true,
    value: { id: 'sig_1', workspaceId: 'ws_1', settings: stored.settings },
  }),
}));
vi.mock('@/lib/view-tracker', () => ({ trackOrganizerView: async () => {} }));
vi.mock('../actions', () => ({
  setRequireEmailAction: vi.fn(),
  setSignupLocaleAction: vi.fn(),
  deleteSignupAction: vi.fn(),
}));

const { default: SettingsTab } = await import('./page');

async function renderTab(searchParams: { saved?: string } = {}) {
  const page = await SettingsTab({
    params: Promise.resolve({ id: 'sig_1' }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(page);
}

const languageSection = () => screen.queryByRole('region', { name: 'Language' });

afterEach(() => {
  cleanup();
  ship(shippedToday);
  stored.settings = {};
  instance.defaultLocale = undefined;
});

describe('Settings tab: Signup language', () => {
  it('isn’t there while one language has shipped to participants', async () => {
    await renderTab();
    expect(screen.getByRole('region', { name: 'Sign-up form' })).toBeInTheDocument();
    expect(languageSection()).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Signup language' })).not.toBeInTheDocument();
  });

  it('offers each shipped language by its own name once there are two', async () => {
    ship(['en', 'sv']);
    stored.settings = { locale: 'sv' };
    await renderTab();

    const section = languageSection();
    expect(section).toBeInTheDocument();
    const form = within(section!);
    expect(form.getByRole('group', { name: 'Signup language' })).toBeInTheDocument();
    const english = form.getByRole('radio', { name: 'English' });
    const swedish = form.getByRole('radio', { name: 'Svenska' });
    expect(english).toHaveAttribute('name', 'locale');
    expect(english).toHaveAttribute('value', 'en');
    expect(swedish).toHaveAttribute('value', 'sv');
    // Each name is marked as its own language, for screen readers.
    expect(form.getByText('Svenska')).toHaveAttribute('lang', 'sv');
    expect(swedish).toBeChecked();
    expect(english).not.toBeChecked();
    expect(form.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(form.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the instance’s language for a signup with none, or one that has left the list', async () => {
    ship(['en', 'sv']);
    await renderTab();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    cleanup();

    stored.settings = { locale: 'xx' };
    await renderTab();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Svenska' })).not.toBeChecked();
    cleanup();

    // The instance's own, once it has shipped: what the signup's pages use.
    instance.defaultLocale = 'sv';
    await renderTab();
    expect(screen.getByRole('radio', { name: 'Svenska' })).toBeChecked();
  });

  it('says Saved by the form that saved, and only there', async () => {
    ship(['en', 'sv']);
    await renderTab({ saved: 'language' });
    expect(within(languageSection()!).getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    cleanup();

    await renderTab({ saved: '1' });
    const emailForm = screen.getByRole('region', { name: 'Sign-up form' });
    expect(within(emailForm).getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
