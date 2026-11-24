// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { CATALOG_LOCALES, languageName } from '@/i18n/config';
import { OTHER_LOCALE } from '@/i18n/testing/locales';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';

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
  fields: [] as { ref: string; label: string; fieldType: string; sortOrder: number }[],
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
    value: { id: 'sig_1', workspaceId: 'ws_1', settings: stored.settings, fields: stored.fields },
  }),
}));
vi.mock('@/lib/view-tracker', () => ({ trackOrganizerView: async () => {} }));
vi.mock('../actions', () => ({
  saveSignupSettingsAction: vi.fn(),
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
  stored.fields = [];
  stored.organizerLocale = null;
  instance.defaultLocale = undefined;
});

describe('Settings tab: a refused save or delete', () => {
  it('reads as before, worded by the code the action sends', async () => {
    const lines = {
      forbidden: "You don't have edit access.",
      not_found: 'No longer available.',
      invalid_input: "Some values weren't accepted.",
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
  beforeEach(shipOnlyEnglish);

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
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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

  it('says Saved after a save, and nothing for any other value', async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    await renderTab({ saved: '1' });
    expect(screen.getByRole('status')).toHaveTextContent(/^Saved$/);
    cleanup();

    for (const saved of ['language', 'true', '']) {
      await renderTab({ saved });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      cleanup();
    }
  });
});

// #899's tophat: with a Save on each card, saving one dropped an unsaved
// change in the other without a word.
describe('Settings tab: one Save', () => {
  /** The form a control is in. */
  const formOf = (control: HTMLElement) => (control as HTMLInputElement).form!;
  const shown = (form: HTMLFormElement, name: string) =>
    (form.elements.namedItem(name) as HTMLInputElement | null)?.value;

  it('saves the email choice and the language together', async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    stored.settings = { requireEmail: false, locale: OTHER_LOCALE };
    await renderTab();
    const form = formOf(screen.getByRole('radio', { name: 'Optional' }));
    expect(formOf(screen.getByRole('radio', { name: languageName(OTHER_LOCALE) }))).toBe(form);
    expect(screen.getAllByRole('button', { name: 'Save' })).toEqual([
      within(form).getByRole('button', { name: 'Save' }),
    ]);
    // Each choice says what it showed, so Save sends only what changed.
    expect(shown(form, 'requireEmailShown')).toBe('optional');
    expect(shown(form, 'localeShown')).toBe(OTHER_LOCALE);
    // Delete is a form of its own, outside it.
    expect(form).not.toContainElement(screen.getByRole('button', { name: 'Delete signup' }));
  });

  it('has the email choice alone while one language has shipped, with the same one Save', async () => {
    shipOnlyEnglish();
    await renderTab();
    const form = formOf(screen.getByRole('radio', { name: 'Required' }));
    expect(screen.getAllByRole('button', { name: 'Save' })).toEqual([
      within(form).getByRole('button', { name: 'Save' }),
    ]);
    expect(shown(form, 'requireEmailShown')).toBe('required');
    // No language to send, so the action sends none.
    expect(form.elements.namedItem('localeShown')).toBeNull();
    expect(form.elements.namedItem('locale')).toBeNull();
  });
});

// #592: reminders are switched on the date field, on the Build tab. This tab
// says whether they're on, by the field's own label, and where to change them.
describe('Settings tab: Reminders', () => {
  const remindersCard = () => within(screen.getByRole('region', { name: 'Reminders' }));
  const shift = { ref: 'when', label: 'Shift day', fieldType: 'date', sortOrder: 1 };
  const what = { ref: 'what', label: 'What', fieldType: 'text', sortOrder: 0 };
  const required = 'We email everyone their link to change or cancel.';
  const requiredWithReminder =
    'We email everyone their link to change or cancel, and a reminder the day before their slot.';

  it('says they’re on, by the date field’s label, and where to turn them off', async () => {
    stored.fields = [what, shift];
    stored.settings = { reminderFromFieldRef: 'when' };
    await renderTab();
    expect(
      remindersCard().getByText(
        "People who give an email get a reminder the day before their slot's Shift day. To turn reminders off, open Fields on the Build tab and choose Shift day.",
      ),
    ).toBeInTheDocument();
    // The email line says a reminder comes too.
    expect(screen.getByText(requiredWithReminder)).toBeInTheDocument();
    expect(screen.queryByText(required)).not.toBeInTheDocument();
  });

  it('says they’re off, and where to turn them on', async () => {
    stored.fields = [what, shift];
    stored.settings = { reminderFromFieldRef: 'when', sendReminders: false };
    await renderTab();
    expect(
      remindersCard().getByText(
        'Reminders are off. To turn them on, open Fields on the Build tab and choose Shift day.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(required)).toBeInTheDocument();
    expect(screen.queryByText(requiredWithReminder)).not.toBeInTheDocument();
  });

  it('says there are none when the slots have no date field', async () => {
    stored.fields = [what];
    await renderTab();
    expect(
      remindersCard().getByText('No reminders: your slots have no date field.'),
    ).toBeInTheDocument();
    expect(screen.getByText(required)).toBeInTheDocument();
  });

  it('keeps the Optional line’s word on reminders', async () => {
    stored.fields = [what, shift];
    stored.settings = { reminderFromFieldRef: 'when', requireEmail: false };
    await renderTab();
    expect(screen.getByRole('radio', { name: 'Optional' })).toBeChecked();
    expect(
      screen.getByText(/They get no emails, not even reminders/, { selector: 'p' }),
    ).toBeInTheDocument();
    expect(
      remindersCard().getByText(/^People who give an email get a reminder/),
    ).toBeInTheDocument();
  });

  it('has no switch of its own', async () => {
    stored.fields = [what, shift];
    stored.settings = { reminderFromFieldRef: 'when' };
    await renderTab();
    expect(remindersCard().queryByRole('checkbox')).not.toBeInTheDocument();
    expect(remindersCard().queryByRole('radio')).not.toBeInTheDocument();
    expect(remindersCard().queryByRole('button')).not.toBeInTheDocument();
  });

  it.each(OTHER_LOCALES)('is in the organizer’s language, %s', async (other) => {
    ship('organizer', ['en', other]);
    stored.organizerLocale = other;
    stored.fields = [what, shift];
    stored.settings = { reminderFromFieldRef: 'when' };
    await renderTab();
    const card = within(
      screen.getByRole('region', { name: `organizer.signupSettings.reminders.title in ${other}` }),
    );
    expect(card.getByText(`organizer.signupSettings.reminders.on in ${other}`)).toBeInTheDocument();
    expect(
      screen.getByText(`organizer.signupSettings.signupForm.requiredHelpReminders in ${other}`),
    ).toBeInTheDocument();
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

    const language = within(screen.getByRole('region', { name: say('language.title') }));
    expect(language.getByRole('group', { name: say('language.legend') })).toBeInTheDocument();
    expect(language.getByText(say('language.help'))).toBeInTheDocument();

    const save = screen.getByRole('button', { name: say('save') });
    expect(save).toHaveAttribute('data-loading-label', say('saving'));
    expect(screen.getByRole('status')).toHaveTextContent(saved);

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
        "This signup's page and emails use it for buttons, messages and dates. Write your title and slots in the same language. People who already signed up see it in the new language too.",
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
