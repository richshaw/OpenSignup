// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { ship } from '@/i18n/testing/ship';

// Unit tests have no server environment. The instance sets no language
// unless a test sets one.
const instance = vi.hoisted(() => ({ defaultLocale: undefined as string | undefined }));
vi.mock('@/i18n/server', () => ({ instanceDefaultLocale: () => instance.defaultLocale }));

// The signup as the page loads it, and what the page needs around it: a
// session (with the organizer's saved language, if any), the browser's
// Accept-Language, the view it records and the server actions, which need a
// database.
const stored = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
const organizer = vi.hoisted(() => ({
  saved: null as string | null,
  acceptLanguage: null as string | null,
}));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({ locale: organizer.saved }),
  toActor: () => ({ kind: 'anonymous' }),
}));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(
      organizer.acceptLanguage === null ? {} : { 'accept-language': organizer.acceptLanguage },
    ),
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
  setOrganizerLocaleFromSignupAction: vi.fn(),
  deleteSignupAction: vi.fn(),
}));

const { default: SettingsTab } = await import('./page');

async function renderTab(searchParams: Record<string, string> = {}) {
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
  Object.assign(organizer, { saved: null, acceptLanguage: null });
});

describe('Settings tab: Signup language', () => {
  it('isn’t there while one language has shipped to participants', async () => {
    await renderTab();
    expect(screen.getByRole('region', { name: 'Sign-up form' })).toBeInTheDocument();
    expect(languageSection()).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Signup language' })).not.toBeInTheDocument();
  });

  it('offers each shipped language by its own name once there are two', async () => {
    ship('participant', ['en', 'sv']);
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
    ship('participant', ['en', 'sv']);
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
    ship('participant', ['en', 'sv']);
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

describe('Settings tab: the question after a language save', () => {
  const question = () => screen.queryByText(/your language for new signups\?$/);

  it('asks, after a save to a language that isn’t the organizer’s, to make it theirs', async () => {
    ship('participant', ['en', 'sv']);
    stored.settings = { locale: 'sv' };
    await renderTab({ saved: 'language' });

    const asked = question();
    expect(asked).toHaveTextContent('Make Svenska your language for new signups?');
    expect(asked).toHaveAttribute('role', 'status');
    expect(within(asked!).getByText('Svenska')).toHaveAttribute('lang', 'sv');
    const section = within(languageSection()!);
    // Yes sends the signup's language.
    const yes = section.getByRole('button', { name: 'Yes' });
    // The answers are in a group the question names.
    expect(yes.closest('[role=group]')).toHaveAccessibleName(
      'Make Svenska your language for new signups?',
    );
    expect(yes.closest('form')!.querySelector('input[type=hidden][name=locale]')).toHaveValue('sv');
    // "Saved" still shows by the form that saved.
    expect(section.getByText('Saved')).toBeInTheDocument();
  });

  it('brings the question into view by giving Yes the focus, and No comes back to the form', async () => {
    ship('participant', ['en', 'sv']);
    stored.settings = { locale: 'sv' };
    await renderTab({ saved: 'language' });

    // Focus scrolls Yes into view, clear of the phone's Share bar (the page's
    // scroll-padding-bottom) and with the box's edge (its scroll margin).
    const yes = screen.getByRole('button', { name: 'Yes' });
    expect(yes).toHaveFocus();
    expect(yes).toHaveClass('scroll-mb-4');
    // No is the tab without the question, at the choices that asked it, which
    // the router focuses.
    const no = screen.getByRole('link', { name: 'No' });
    expect(no).toHaveAttribute('href', '/app/signups/sig_1/settings#signup-language');
    const choices = screen.getByRole('group', { name: 'Signup language' });
    expect(choices).toHaveAttribute('id', 'signup-language');
    expect(choices).toHaveAttribute('tabindex', '-1');
  });

  it('moves the focus nowhere after a save that asks nothing', async () => {
    ship('participant', ['en', 'sv']);
    stored.settings = { locale: 'sv' };
    organizer.saved = 'sv';
    await renderTab({ saved: 'language' });
    expect(question()).not.toBeInTheDocument();
    expect(document.body).toHaveFocus();
  });

  it('doesn’t ask when the signup’s language is already the organizer’s, saved or not', async () => {
    ship('participant', ['en', 'sv']);
    stored.settings = { locale: 'sv' };
    for (const setup of [
      { saved: 'sv', acceptLanguage: null },
      // Nothing saved: what new signups get, here the browser's language.
      { saved: null, acceptLanguage: 'sv-SE,en;q=0.8' },
    ]) {
      Object.assign(organizer, setup);
      await renderTab({ saved: 'language' });
      expect(languageSection()).toBeInTheDocument();
      expect(question()).not.toBeInTheDocument();
      cleanup();
    }

    // English saved on a signup with none: the instance's English either way.
    Object.assign(organizer, { saved: null, acceptLanguage: null });
    stored.settings = { locale: 'en' };
    await renderTab({ saved: 'language' });
    expect(question()).not.toBeInTheDocument();
  });

  it('asks only right after that form saved, whatever else the address says', async () => {
    ship('participant', ['en', 'sv']);
    stored.settings = { locale: 'sv' };
    const addresses: Record<string, string>[] = [
      {},
      { saved: '1' },
      { saved: 'new-signups' },
      { saved: 'Make Klingon your language' },
      { offer: 'sv' },
      { locale: 'sv', question: 'Make Svenska your language for new signups?' },
    ];
    for (const searchParams of addresses) {
      await renderTab(searchParams);
      expect(question()).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('never asks while one language has shipped to participants', async () => {
    stored.settings = { locale: 'sv' };
    await renderTab({ saved: 'language' });
    expect(question()).not.toBeInTheDocument();
  });

  it('says the language is the organizer’s after its Yes, and only once it is', async () => {
    ship('participant', ['en', 'sv']);
    stored.settings = { locale: 'sv' };
    organizer.saved = 'sv';
    await renderTab({ saved: 'new-signups' });
    const done = within(languageSection()!).getByRole('status');
    expect(done).toHaveTextContent('Saved. New signups you make will start in Svenska.');
    expect(within(done).getByText('Svenska')).toHaveAttribute('lang', 'sv');
    expect(question()).not.toBeInTheDocument();
    cleanup();

    // A link that says so when it isn't true shows nothing.
    organizer.saved = 'en';
    await renderTab({ saved: 'new-signups' });
    expect(screen.queryByText(/New signups you make/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
