// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { CATALOG_LOCALES, languageName } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';

// Unit tests have no server environment. The instance sets no language
// unless a test sets one. English comes from the catalog; any other language
// answers with the key it was asked for and the language.
const instance = vi.hoisted(() => ({ defaultLocale: undefined as string | undefined }));
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => instance.defaultLocale,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

// The signup as the page loads it, and what the page needs around it: a
// session, the view it records and the server actions, which need a database.
const stored = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  /** The language stored on the organizer's account. */
  organizerLocale: null as string | null,
}));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({ locale: stored.organizerLocale }),
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
// A submit button shows its loading label only while its form is pending,
// which a test can't hold. This one shows it as an attribute instead.
vi.mock('@/components/ui/async-submit-button', async () => {
  const { createElement } = await import('react');
  type Props = { loadingLabel: string; children: ReactNode };
  return {
    AsyncSubmitButton: ({ loadingLabel, children }: Props) =>
      createElement('button', { type: 'submit', 'data-loading-label': loadingLabel }, children),
  };
});

const { default: SettingsTab } = await import('./page');

async function renderTab(searchParams: { error?: string; saved?: string } = {}) {
  const page = await SettingsTab({
    params: Promise.resolve({ id: 'sig_1' }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(page);
}

const languageSection = () => screen.queryByRole('region', { name: 'Language' });

/** Every language with a catalog but English. */
const OTHER_LOCALES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

afterEach(() => {
  cleanup();
  stored.settings = {};
  stored.organizerLocale = null;
  instance.defaultLocale = undefined;
});

describe('Settings tab: a refused save or delete', () => {
  it('reads as before, worded by the code the action sends', async () => {
    const lines = {
      forbidden: 'You don’t have edit access.',
      not_found: 'No longer available.',
      invalid_input: 'Some values weren’t accepted.',
      internal: 'Save failed.',
    };
    for (const [error, line] of Object.entries(lines)) {
      await renderTab({ error });
      expect(screen.getByRole('alert')).toHaveTextContent(line);
      cleanup();
    }
  });

  it('shows nothing for anything else, so a link can’t put words on the page', async () => {
    for (const error of ['Your account is locked. Email us at once.', 'toString', '']) {
      await renderTab({ error });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      cleanup();
    }
  });

  it.each(OTHER_LOCALES)('is in the organizer’s language, %s', async (other) => {
    ship('organizer', ['en', other]);
    stored.organizerLocale = other;
    await renderTab({ error: 'forbidden' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      `organizer.errors.code.forbidden in ${other}`,
    );
  });
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

describe('Settings tab: its words', () => {
  /**
   * Each part of the tab, found by the words it should show, as a test reads
   * them: `say` gives the text for a key under `organizer.signupSettings`,
   * and `saved` the Saved notice's. Every catalog language is shipped to
   * participants, so Signup language is there.
   */
  async function expectTab(say: (key: string) => string, saved: string) {
    ship('participant', CATALOG_LOCALES);
    await renderTab({ saved: '1' });

    const form = within(screen.getByRole('region', { name: say('signupForm.title') }));
    expect(form.getByRole('group', { name: say('signupForm.askForEmail') })).toBeInTheDocument();
    expect(form.getByRole('radio', { name: say('signupForm.required') })).toBeChecked();
    expect(form.getByRole('radio', { name: say('signupForm.optional') })).not.toBeChecked();
    expect(form.getByText(say('signupForm.requiredHelp'))).toBeInTheDocument();
    expect(form.getByText(say('signupForm.optionalHelp'))).toBeInTheDocument();
    const save = form.getByRole('button', { name: say('save') });
    expect(save).toHaveAttribute('data-loading-label', say('saving'));
    expect(form.getByRole('status')).toHaveTextContent(saved);
    cleanup();

    await renderTab({ saved: 'language' });
    const language = within(screen.getByRole('region', { name: say('language.title') }));
    expect(language.getByRole('group', { name: say('language.legend') })).toBeInTheDocument();
    expect(language.getByText(say('language.help'))).toBeInTheDocument();
    expect(language.getByRole('button', { name: say('save') })).toHaveAttribute(
      'data-loading-label',
      say('saving'),
    );
    expect(language.getByRole('status')).toHaveTextContent(saved);

    const danger = within(screen.getByRole('region', { name: say('delete.title') }));
    expect(danger.getByText(say('delete.body'))).toBeInTheDocument();
    fireEvent.click(danger.getByRole('button', { name: say('delete.start') }));
    const confirm = within(danger.getByRole('alertdialog', { name: say('delete.label') }));
    expect(confirm.getByText(say('delete.question'))).toBeInTheDocument();
    expect(confirm.getByRole('button', { name: say('delete.confirm') })).toHaveAttribute(
      'data-loading-label',
      say('delete.deleting'),
    );
    fireEvent.click(confirm.getByRole('button', { name: say('delete.cancel') }));
    expect(danger.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(danger.getByRole('button', { name: say('delete.start') })).toBeInTheDocument();
  }

  it('reads as before in English, with no language stored', async () => {
    const english: Record<string, string> = {
      'signupForm.title': 'Sign-up form',
      'signupForm.askForEmail': 'Ask for an email address',
      'signupForm.required': 'Required',
      'signupForm.optional': 'Optional',
      'signupForm.requiredHelp': 'We email everyone their link to change or cancel.',
      'signupForm.optionalHelp':
        'People can leave it blank. They get no emails, not even reminders, so they need to save their link. If they lose it, they can sign up again and you can remove the old one on the Responses tab.',
      'language.title': 'Language',
      'language.legend': 'Signup language',
      'language.help':
        'This signup’s page and emails use it for buttons, messages and dates. Write your title and slots in the same language.',
      save: 'Save',
      saving: 'Saving…',
      'delete.title': 'Delete this signup',
      'delete.body':
        'Deleting removes this signup from your dashboard and immediately makes its public link inaccessible.',
      'delete.start': 'Delete signup',
      'delete.label': 'Confirm signup deletion',
      'delete.question': 'This will delete the signup.',
      'delete.confirm': 'Yes, delete signup',
      'delete.deleting': 'Deleting…',
      'delete.cancel': 'Cancel',
    };
    await expectTab((key) => english[key] ?? `no English for ${key}`, 'Saved');
  });

  it.each(OTHER_LOCALES)('is in the organizer’s language, %s', async (other) => {
    ship('organizer', ['en', other]);
    stored.organizerLocale = other;
    await expectTab(
      (key) => `organizer.signupSettings.${key} in ${other}`,
      `organizer.saveNotice.saved in ${other}`,
    );
    // Each language is still named in itself, whatever the tab's language.
    expect(screen.getByRole('radio', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByText(languageName(other))).toHaveAttribute('lang', other);
  });
});
