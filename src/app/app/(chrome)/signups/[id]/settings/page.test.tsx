// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { OTHER_LOCALE } from '@/i18n/testing/locales';
import { languageName } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';

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
    ship('participant', ['en', OTHER_LOCALE]);
    stored.settings = { locale: OTHER_LOCALE };
    await renderTab();

    const section = languageSection();
    expect(section).toBeInTheDocument();
    const form = within(section!);
    expect(form.getByRole('group', { name: 'Signup language' })).toBeInTheDocument();
    const english = form.getByRole('radio', { name: 'English' });
    const other = form.getByRole('radio', { name: languageName(OTHER_LOCALE) });
    expect(english).toHaveAttribute('name', 'locale');
    expect(english).toHaveAttribute('value', 'en');
    expect(other).toHaveAttribute('value', OTHER_LOCALE);
    // Each name is marked as its own language, for screen readers.
    expect(form.getByText(languageName(OTHER_LOCALE))).toHaveAttribute('lang', OTHER_LOCALE);
    expect(other).toBeChecked();
    expect(english).not.toBeChecked();
    expect(form.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(form.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the instance’s language for a signup with none, or one that has left the list', async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    await renderTab();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    cleanup();

    stored.settings = { locale: 'xx' };
    await renderTab();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('radio', { name: languageName(OTHER_LOCALE) })).not.toBeChecked();
    cleanup();

    // The instance's own, once it has shipped: what the signup's pages use.
    instance.defaultLocale = OTHER_LOCALE;
    await renderTab();
    expect(screen.getByRole('radio', { name: languageName(OTHER_LOCALE) })).toBeChecked();
  });

  it('says Saved by the form that saved, and only there', async () => {
    ship('participant', ['en', OTHER_LOCALE]);
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
