// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { CATALOG_LOCALES, type CatalogLocale, languageName } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';

// What the page reads around the form: the instance's language (none, unless
// a test sets one) and the session, with the language stored on the account.
// Nothing from the request: next/headers isn't mocked, so a page that read it
// would throw here, outside any request.
const request = vi.hoisted(() => ({
  instanceDefault: undefined as string | undefined,
  saved: null as string | null,
}));
// The page's text: English from the catalog; any other language answers with
// the key it was asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => request.instanceDefault,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));
vi.mock('@/auth/session', () => ({
  getOrganizerSession: async () => ({ email: 'pat@example.com', locale: request.saved }),
  requireOrganizerSession: async () => ({ email: 'pat@example.com', locale: request.saved }),
  toActor: () => ({ kind: 'organizer', id: 'org_1' }),
}));
// The server actions need a database, and so does the read of the
// organizer's open signups, which a test answers with how many there are and
// the ids of those in another language.
vi.mock('./actions', () => ({
  setOrganizerLocaleAction: vi.fn(),
  switchOpenSignupsLocaleAction: vi.fn(),
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
const openSignupsToSwitch = vi.hoisted(() =>
  vi.fn(async (_db: unknown, _actor: unknown, _locale: string) => ({
    ok: true as const,
    value: { open: 0, toSwitch: [] as string[] },
  })),
);
vi.mock('@/services/signups', () => ({ openSignupsToSwitch }));

const { default: SettingsPage, generateMetadata } = await import('./page');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

async function renderPage(searchParams: Record<string, string> = {}) {
  return render(await SettingsPage({ searchParams: Promise.resolve(searchParams) }));
}

const languageGroup = () => screen.queryByRole('group', { name: 'Language' });
const checked = () =>
  screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked);

afterEach(() => {
  cleanup();
  Object.assign(request, { instanceDefault: undefined, saved: null });
  openSignupsToSwitch.mockClear();
  openSignupsToSwitch.mockResolvedValue({ ok: true, value: { open: 0, toSwitch: [] } });
});

describe('Account Settings', () => {
  it('reads as before: the heading, who is signed in, and the Connected apps card', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Settings$/);
    const signedIn = screen.getByText('pat@example.com');
    expect(signedIn).toHaveClass('font-medium');
    expect(signedIn.parentElement).toHaveTextContent(/^Signed in as pat@example\.com\.$/);
    const card = screen.getByRole('link', { name: /Connected apps/ });
    expect(card).toHaveAttribute('href', '/app/settings/connected-apps');
    expect(card).toHaveTextContent(
      'Connected appsAI assistants and other apps you have allowed to use your account, and how to disconnect them.→',
    );
    expect(await generateMetadata()).toEqual({ title: 'Settings' });
  });

  it.each(OTHER_LANGUAGES)('is in the organizer’s language, %s', async (other) => {
    ship('organizer', ['en', other]);
    request.saved = other;
    await renderPage();
    const ask = (key: string) => `organizer.settings.${key} in ${other}`;
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ask('title'));
    expect(screen.getByText(ask('signedInAs'))).toBeInTheDocument();
    const card = screen.getByRole('link', { name: new RegExp(ask('connectedApps.title')) });
    expect(card).toHaveTextContent(ask('connectedApps.description'));
    expect(await generateMetadata()).toEqual({ title: ask('title') });
  });
});

describe('Account Settings: Language', () => {
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

  it('offers each shipped language by its own name once there are two, with the stored one chosen', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    request.instanceDefault = 'en';
    await renderPage();

    const group = within(languageGroup()!);
    const english = group.getByRole('radio', { name: 'English' });
    const swedish = group.getByRole('radio', { name: 'Svenska' });
    expect(english).toHaveAttribute('name', 'locale');
    expect(english).toHaveAttribute('value', 'en');
    expect(swedish).toHaveAttribute('value', 'sv');
    // Each name is marked as its own language, for screen readers.
    expect(group.getByText('Svenska')).toHaveAttribute('lang', 'sv');
    expect(checked()).toEqual([swedish]);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // One setting, two uses: the organizer's own screens, and their new signups.
  it('says what the language is for: the organizer’s screens, and each new signup', async () => {
    ship('participant', CATALOG_LOCALES);
    await renderPage();
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAccessibleDescription(
      'OpenSignup shows your screens and sends your sign-in emails in this language. Each signup you make starts in it too, for the buttons, messages and dates its participants see. To change one signup’s language, use its Settings tab.',
    );
  });

  it('with nothing stored, shows the language new signups would get: the instance’s, else English', async () => {
    ship('participant', ['en', 'sv']);
    const shown = async () => {
      await renderPage();
      const [radio] = checked();
      cleanup();
      return radio?.getAttribute('value') as CatalogLocale;
    };

    // The instance's language, when it has shipped.
    request.instanceDefault = 'sv';
    expect(await shown()).toBe('sv');
    // A stored language that has left the list counts as none.
    request.saved = 'xx';
    expect(await shown()).toBe('sv');
    // English when nothing else applies.
    request.instanceDefault = undefined;
    expect(await shown()).toBe('en');
    // And a stored one always comes first.
    request.instanceDefault = 'sv';
    request.saved = 'en';
    expect(await shown()).toBe('en');
  });

  it('says Saved after a save, and nothing for any other value', async () => {
    ship('participant', ['en', 'sv']);
    await renderPage({ saved: 'language' });
    expect(within(languageGroup()!.closest('form')!).getByRole('status')).toHaveTextContent(
      'Saved',
    );
    cleanup();

    await renderPage({ saved: '1' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(OTHER_LANGUAGES)('is in the organizer’s language, %s', async (other) => {
    ship('participant', ['en', other]);
    ship('organizer', ['en', other]);
    request.saved = other;
    await renderPage({ saved: 'language' });
    const ask = (key: string) => `organizer.settings.language.${key} in ${other}`;
    const group = screen.getByRole('group', { name: ask('legend') });
    // Each language is still named in itself, whatever the page's language.
    for (const locale of ['en', other] as const) {
      const radio = within(group).getByRole('radio', { name: languageName(locale) });
      expect(radio).toHaveAccessibleDescription(ask('help'));
      expect(within(group).getByText(languageName(locale))).toHaveAttribute('lang', locale);
    }
    expect(screen.getByRole('button', { name: ask('save') })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(ask('saved'));
  });

  it('shows a refusal in the Settings tab’s words, and only for a code the action sends', async () => {
    ship('participant', ['en', 'sv']);
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

describe('Account Settings: switching the open signups', () => {
  const switchButton = () => screen.queryByRole('button', { name: /^Switch your/ });
  /** The organizer has `open` open signups, `count` of them in another language. */
  const toSwitch = (count: number, open = count) =>
    openSignupsToSwitch.mockResolvedValue({
      ok: true,
      value: { open, toSwitch: Array.from({ length: count }, (_, n) => `sig_${n}`) },
    });

  it('isn’t there, and reads nothing, while one language has shipped to participants', async () => {
    request.saved = 'en';
    toSwitch(3);
    await renderPage({ switched: '1' });
    expect(switchButton()).not.toBeInTheDocument();
    expect(screen.queryByText(/now use/)).not.toBeInTheDocument();
    expect(openSignupsToSwitch).not.toHaveBeenCalled();
  });

  it('offers to switch the open signups in another language to the organizer’s, with how many', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    toSwitch(3);
    await renderPage();

    // Asked about the language the choice above shows.
    expect(openSignupsToSwitch).toHaveBeenCalledOnce();
    expect(openSignupsToSwitch.mock.calls[0]?.[2]).toBe('sv');
    const button = switchButton()!;
    expect(button).toHaveAccessibleName('Switch your 3 open signups to Svenska');
    expect(within(button).getByText('Svenska')).toHaveAttribute('lang', 'sv');
    // Its form sends nothing: the action works out the language itself.
    expect(button.closest('form')!.querySelectorAll('input')).toHaveLength(0);
    // Nothing takes the focus.
    expect(document.body).toHaveFocus();
  });

  it('says “signup” for one', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    toSwitch(1);
    await renderPage();
    expect(switchButton()).toHaveAccessibleName('Switch your 1 open signup to Svenska');
  });

  it.each(OTHER_LANGUAGES)(
    'writes a large count as before, without grouping (%s)',
    async (other) => {
      ship('participant', ['en', other]);
      request.saved = other;
      const name = languageName(other);
      toSwitch(1234);
      await renderPage();
      expect(switchButton()).toHaveAccessibleName(`Switch your 1234 open signups to ${name}`);
      cleanup();

      toSwitch(0, 1234);
      await renderPage({ switched: '1' });
      expect(screen.getByRole('status')).toHaveTextContent(
        `Saved. Your 1234 open signups now use ${name}.`,
      );
    },
  );

  it.each(OTHER_LANGUAGES)('is in the organizer’s language, %s', async (other) => {
    ship('participant', ['en', other]);
    ship('organizer', ['en', other]);
    request.saved = other;
    const ask = (key: string) => `organizer.settings.language.${key} in ${other}`;
    toSwitch(3);
    await renderPage();
    expect(screen.getByRole('button', { name: ask('switch') })).toBeInTheDocument();
    cleanup();

    toSwitch(0, 4);
    await renderPage({ switched: '1' });
    expect(screen.getByRole('status')).toHaveTextContent(ask('switched'));
  });

  it('isn’t there when every open signup is in the organizer’s language, or there are none', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    await renderPage({ saved: 'language' });
    expect(openSignupsToSwitch).toHaveBeenCalledOnce();
    expect(switchButton()).not.toBeInTheDocument();
    // The language's own Save says only "Saved", as before.
    expect(screen.getByRole('status')).toHaveTextContent(/^Saved$/);
  });

  it('says how many open signups use the language after the switch, from what’s stored', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    toSwitch(0, 4);
    await renderPage({ switched: '1' });
    const done = screen.getByRole('status');
    expect(done).toHaveTextContent('Saved. Your 4 open signups now use Svenska.');
    expect(within(done).getByText('Svenska')).toHaveAttribute('lang', 'sv');
    expect(document.body).toHaveFocus();
    cleanup();

    toSwitch(0, 1);
    await renderPage({ switched: '1' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved. Your 1 open signup now uses Svenska.',
    );
    cleanup();

    // With signups still in another language, the button shows instead.
    toSwitch(2, 4);
    await renderPage({ switched: '1' });
    expect(screen.queryByText(/now use/)).not.toBeInTheDocument();
    expect(switchButton()).toHaveAccessibleName('Switch your 2 open signups to Svenska');
  });

  it('says nothing to an organizer with no open signups, whatever the address says', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    await renderPage({ switched: '1' });
    expect(screen.queryByText(/now use/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('takes only a flag from the address, never a number', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    toSwitch(0, 4);
    // Only the action's flag, `1`, shows the line, with the count from what's
    // stored (4 here); a number a link puts in its place shows nothing.
    for (const switched of ['9999', '3', '0']) {
      await renderPage({ switched });
      expect(screen.queryByText(/now use/)).not.toBeInTheDocument();
      cleanup();
    }
    for (const switched of ['-1', 'abc', 'true', '1e3', 'Your 9999 signups were deleted', '']) {
      await renderPage({ switched });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      cleanup();
    }
  });
});
