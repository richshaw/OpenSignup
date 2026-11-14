// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CatalogLocale } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';
import { ServiceException } from '@/lib/errors';

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
// organizer's open signups, which a test answers with their ids.
const setOpenSignupsLocaleAction = vi.hoisted(() => vi.fn());
vi.mock('./actions', () => ({
  setOrganizerLocaleAction: vi.fn(),
  setOpenSignupsLocaleAction,
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

/**
 * The forms submitted from now until the test ends, in order. Each submit is
 * stopped once React has had it, since jsdom can't load another page.
 */
function submittedForms(): HTMLFormElement[] {
  const forms: HTMLFormElement[] = [];
  const record = (event: Event) => {
    forms.push(event.target as HTMLFormElement);
    event.preventDefault();
  };
  document.addEventListener('submit', record);
  onTestFinished(() => document.removeEventListener('submit', record));
  return forms;
}

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
  setOpenSignupsLocaleAction.mockClear();
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

describe('Account Settings: the question after a language save', () => {
  const question = () => screen.queryByText(/for your open signups too\?$/);
  const toSwitch = (ids: string[]) =>
    openSignupsToSwitch.mockResolvedValue({ ok: true, value: ids });

  it('asks to put the open signups in the saved language when any of them isn’t', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    toSwitch(['sig_1', 'sig_2']);
    await renderPage({ saved: 'language' });

    // Asked about the organizer's own language, as they saved it.
    expect(openSignupsToSwitch).toHaveBeenCalledOnce();
    expect(openSignupsToSwitch.mock.calls[0]?.[2]).toBe('sv');
    const asked = question();
    expect(asked).toHaveTextContent('Use Svenska for your open signups too?');
    expect(asked).toHaveAttribute('role', 'status');
    expect(within(asked!).getByText('Svenska')).toHaveAttribute('lang', 'sv');
    const yes = screen.getByRole('button', { name: 'Yes' });
    // The answers are in a group the question names.
    expect(yes.closest('[role=group]')).toHaveAccessibleName(
      'Use Svenska for your open signups too?',
    );
    expect(yes.closest('form')!.querySelector('input[type=hidden][name=locale]')).toHaveValue('sv');
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('gives No the focus, first in the row, so a second press or tap after Save says No', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    toSwitch(['sig_1']);
    await renderPage({ saved: 'language' });

    const group = screen.getByRole('group', { name: 'Use Svenska for your open signups too?' });
    const [no, yes] = within(group).getAllByRole('button') as [
      HTMLButtonElement,
      HTMLButtonElement,
    ];
    expect(no).toHaveAccessibleName('No');
    expect(yes).toHaveAccessibleName('Yes');
    // The focus scrolls No into view, with the box's edge (its scroll margin),
    // and puts it, not Yes, under the key or finger that pressed Save.
    expect(no).toHaveFocus();
    expect(no).toHaveClass('scroll-mb-4');
    expect(yes).not.toHaveFocus();

    // Pressing what has the focus goes back to the choices that asked,
    // changing no signup: a plain GET form with no fields. Yes's action, which
    // would switch every open signup, isn't called.
    const submitted = submittedForms();
    fireEvent.click(document.activeElement!);
    const noForm = no.form!;
    expect(submitted).toEqual([noForm]);
    expect(noForm).toHaveAttribute('method', 'get');
    expect(noForm).toHaveAttribute('action', '/app/settings#organizer-language');
    expect(noForm.querySelectorAll('input')).toHaveLength(0);
    expect(setOpenSignupsLocaleAction).not.toHaveBeenCalled();
    // The choices it comes back to can take the focus.
    const choices = screen.getByRole('group', { name: 'Language for new signups' });
    expect(choices).toHaveAttribute('id', 'organizer-language');
    expect(choices).toHaveAttribute('tabindex', '-1');
  });

  it('moves the focus nowhere after a save that asks nothing', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    await renderPage({ saved: 'language' });
    expect(question()).not.toBeInTheDocument();
    expect(document.body).toHaveFocus();
  });

  it('doesn’t ask when every open signup is in it already, or there are none', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    await renderPage({ saved: 'language' });
    expect(openSignupsToSwitch).toHaveBeenCalledOnce();
    expect(question()).not.toBeInTheDocument();
  });

  it('asks only right after the language saved, and reads nothing otherwise', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    toSwitch(['sig_1']);
    const addresses: Record<string, string>[] = [
      {},
      { saved: '1' },
      { saved: 'Use Klingon for everything' },
      { ask: 'open-signups', locale: 'sv' },
    ];
    for (const searchParams of addresses) {
      await renderPage(searchParams);
      expect(question()).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument();
      cleanup();
    }
    expect(openSignupsToSwitch).not.toHaveBeenCalled();
  });

  it('never asks, or reads, while one language has shipped to participants', async () => {
    request.saved = 'en';
    toSwitch(['sig_1']);
    await renderPage({ saved: 'language' });
    expect(question()).not.toBeInTheDocument();
    expect(openSignupsToSwitch).not.toHaveBeenCalled();
  });

  it('says the open signups use it after its Yes, and only once they all do', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    await renderPage({ saved: 'open-signups' });
    const done = screen.getByRole('status');
    expect(done).toHaveTextContent('Saved. Your open signups now use Svenska.');
    expect(within(done).getByText('Svenska')).toHaveAttribute('lang', 'sv');
    expect(question()).not.toBeInTheDocument();
    cleanup();

    // A link that says so when it isn't true shows nothing.
    toSwitch(['sig_1']);
    await renderPage({ saved: 'open-signups' });
    expect(screen.queryByText(/Your open signups now use/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows nothing when the read is refused', async () => {
    ship('participant', ['en', 'sv']);
    request.saved = 'sv';
    openSignupsToSwitch.mockRejectedValue(
      new ServiceException({ code: 'unauthorized', message: 'sign in required' }),
    );
    await renderPage({ saved: 'language' });
    expect(question()).not.toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
});
