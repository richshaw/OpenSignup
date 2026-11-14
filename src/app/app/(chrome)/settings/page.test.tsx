// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { CatalogLocale } from '@/i18n/config';
import { OTHER_LOCALE, withRegion } from '@/i18n/testing/locales';
import { languageName } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';

// What the page reads around the form: the instance's language (none, unless
// a test sets one), the browser's Accept-Language, and the session.
const request = vi.hoisted(() => ({
  instanceDefault: undefined as string | undefined,
  acceptLanguage: null as string | null,
  saved: null as string | null,
}));
vi.mock('@/i18n/server', () => ({ instanceDefaultLocale: () => request.instanceDefault }));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(
      request.acceptLanguage === null ? {} : { 'accept-language': request.acceptLanguage },
    ),
}));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({ email: 'pat@example.com', locale: request.saved }),
}));
// The server action needs a database.
vi.mock('./actions', () => ({ setOrganizerLocaleAction: vi.fn() }));

const { default: SettingsPage } = await import('./page');

async function renderPage(searchParams: { error?: string; saved?: string } = {}) {
  return render(await SettingsPage({ searchParams: Promise.resolve(searchParams) }));
}

const languageGroup = () => screen.queryByRole('group', { name: 'Language for new signups' });
const checked = () =>
  screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked);

afterEach(() => {
  cleanup();
  Object.assign(request, { instanceDefault: undefined, acceptLanguage: null, saved: null });
});

describe('Account Settings: Language for new signups', () => {
  it('isn’t there while one language has shipped to participants', async () => {
    request.saved = 'en';
    await renderPage({ saved: 'language' });
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Connected apps/ })).toBeInTheDocument();
    expect(languageGroup()).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers each shipped language by its own name once there are two, with the saved one chosen', async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    request.saved = OTHER_LOCALE;
    request.acceptLanguage = 'en';
    await renderPage();

    const group = within(languageGroup()!);
    const english = group.getByRole('radio', { name: 'English' });
    const other = group.getByRole('radio', { name: languageName(OTHER_LOCALE) });
    expect(english).toHaveAttribute('name', 'locale');
    expect(english).toHaveAttribute('value', 'en');
    expect(other).toHaveAttribute('value', OTHER_LOCALE);
    // Each name is marked as its own language, for screen readers.
    expect(group.getByText(languageName(OTHER_LOCALE))).toHaveAttribute('lang', OTHER_LOCALE);
    expect(checked()).toEqual([other]);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('with nothing saved, shows the language new signups would get', async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    const shown = async () => {
      await renderPage();
      const [radio] = checked();
      cleanup();
      return radio?.getAttribute('value') as CatalogLocale;
    };

    // The browser's top language, when it has shipped.
    request.acceptLanguage = `${withRegion(OTHER_LOCALE)},en;q=0.8`;
    expect(await shown()).toBe(OTHER_LOCALE);
    // The instance's language comes before the browser.
    request.instanceDefault = 'en';
    expect(await shown()).toBe('en');
    // A saved language that has left the list counts as none.
    request.instanceDefault = undefined;
    request.saved = 'xx';
    expect(await shown()).toBe(OTHER_LOCALE);
    // English when nothing else applies.
    request.acceptLanguage = null;
    expect(await shown()).toBe('en');
  });

  it('says Saved after a save, and nothing for any other value', async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    await renderPage({ saved: 'language' });
    expect(within(languageGroup()!.closest('form')!).getByRole('status')).toHaveTextContent(
      'Saved',
    );
    cleanup();

    await renderPage({ saved: '1' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a refusal in the Settings tab’s words, and only for a code the action sends', async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    await renderPage({ error: 'invalid_input' });
    expect(screen.getByRole('alert')).toHaveTextContent('Some values weren’t accepted.');
    cleanup();

    for (const error of ['Your account is locked. Email us at once.', 'toString', '']) {
      await renderPage({ error });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      cleanup();
    }
  });
});
