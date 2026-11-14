// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { CatalogLocale } from '@/i18n/config';
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
  toActor: () => ({ kind: 'organizer', id: 'org_1' }),
}));
// The server actions need a database, and so does the read of the
// organizer's open signups in another language, which a test answers with
// their ids.
vi.mock('./actions', () => ({
  setOrganizerLocaleAction: vi.fn(),
  switchOpenSignupsLocaleAction: vi.fn(),
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
const openSignupsToSwitch = vi.hoisted(() =>
  vi.fn(async (_db: unknown, _actor: unknown, _locale: string) => ({
    ok: true as const,
    value: [] as string[],
  })),
);
vi.mock('@/services/signups', () => ({ openSignupsToSwitch }));

const { default: SettingsPage } = await import('./page');

async function renderPage(searchParams: Record<string, string> = {}) {
  return render(await SettingsPage({ searchParams: Promise.resolve(searchParams) }));
}

const languageGroup = () => screen.queryByRole('group', { name: 'Language for new signups' });
const checked = () =>
  screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked);

afterEach(() => {
  cleanup();
  Object.assign(request, { instanceDefault: undefined, acceptLanguage: null, saved: null });
  openSignupsToSwitch.mockClear();
  openSignupsToSwitch.mockResolvedValue({ ok: true, value: [] });
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
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    request.acceptLanguage = 'en';
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

  it('with nothing saved, shows the language new signups would get', async () => {
    ship('participant', ['en', 'sv']);
    const shown = async () => {
      await renderPage();
      const [radio] = checked();
      cleanup();
      return radio?.getAttribute('value') as CatalogLocale;
    };

    // The browser's top language, when it has shipped.
    request.acceptLanguage = 'sv-SE,en;q=0.8';
    expect(await shown()).toBe('sv');
    // The instance's language comes before the browser.
    request.instanceDefault = 'en';
    expect(await shown()).toBe('en');
    // A saved language that has left the list counts as none.
    request.instanceDefault = undefined;
    request.saved = 'xx';
    expect(await shown()).toBe('sv');
    // English when nothing else applies.
    request.acceptLanguage = null;
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
  const toSwitch = (count: number) =>
    openSignupsToSwitch.mockResolvedValue({
      ok: true,
      value: Array.from({ length: count }, (_, n) => `sig_${n}`),
    });

  it('isn’t there, and reads nothing, while one language has shipped to participants', async () => {
    request.saved = 'en';
    toSwitch(3);
    await renderPage({ switched: '3' });
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

  it('isn’t there when every open signup is in the organizer’s language, or there are none', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    await renderPage({ saved: 'language' });
    expect(openSignupsToSwitch).toHaveBeenCalledOnce();
    expect(switchButton()).not.toBeInTheDocument();
    // The language's own Save says only "Saved", as before.
    expect(screen.getByRole('status')).toHaveTextContent(/^Saved$/);
  });

  it('says what the switch did once none is left, and only then', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    await renderPage({ switched: '3' });
    const done = screen.getByRole('status');
    expect(done).toHaveTextContent('Saved. 3 signups now use Svenska.');
    expect(within(done).getByText('Svenska')).toHaveAttribute('lang', 'sv');
    expect(document.body).toHaveFocus();
    cleanup();

    await renderPage({ switched: '1' });
    expect(screen.getByRole('status')).toHaveTextContent('Saved. 1 signup now uses Svenska.');
    cleanup();

    // With signups still in another language, the button shows instead.
    toSwitch(2);
    await renderPage({ switched: '3' });
    expect(screen.queryByText(/now use/)).not.toBeInTheDocument();
    expect(switchButton()).toHaveAccessibleName('Switch your 2 open signups to Svenska');
  });

  it('takes only a count from the address', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    for (const switched of ['0', '-1', 'abc', '1e3', '12345', '3 signups were deleted', '']) {
      await renderPage({ switched });
      expect(screen.queryByText(/now use/)).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      cleanup();
    }
  });
});
