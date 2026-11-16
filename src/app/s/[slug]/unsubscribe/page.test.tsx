// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ship } from '@/i18n/testing/ship';
import { serviceError } from '@/lib/errors';
import { err, ok } from '@/lib/result';

const previewReminderOptOut = vi.fn();
// The instance's DEFAULT_LOCALE (none unless a test sets one), and the
// language of the signup the path names, for a link with no row to read.
const request = vi.hoisted(() => ({
  instanceDefault: undefined as string | undefined,
  pathLocale: 'en',
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/services/reminder-optout', () => ({
  previewReminderOptOut: (...args: unknown[]) => previewReminderOptOut(...args),
}));
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => request.instanceDefault,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));
vi.mock('../signup-locale', () => ({ requestedSignupLocale: async () => request.pathLocale }));

const { default: UnsubscribePage, generateMetadata } = await import('./page');

const ON_ERROR = "We couldn't turn your reminders back on. Please try again.";
const OFF_ERROR = "We couldn't turn off your reminders. Please try again.";

const optedOutTarget = {
  participantId: 'par_1',
  participantEmail: 'dana@example.test',
  signupTitle: 'Bake sale',
  signupSlug: 'bake-sale',
  signupLocale: null as string | null,
  optedOut: true,
};

describe('unsubscribe page — opted out', () => {
  beforeEach(() => {
    previewReminderOptOut.mockReset();
    previewReminderOptOut.mockResolvedValue(ok(optedOutTarget));
  });

  it('shows the failure message when error=on after a failed opt-in', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok', error: 'on' }),
    });
    const { container } = render(page);
    expect(container.textContent).toContain(ON_ERROR);
  });

  it('does not show the failure message for a stale error=off on the opted-out page', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok', error: 'off' }),
    });
    const { container } = render(page);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('ignores legacy error=1 beside a successful opt-out', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok', done: 'off', error: '1' }),
    });
    const { container } = render(page);
    expect(container.textContent).toContain('Reminders turned off');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not show the failure message without error', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok' }),
    });
    const { container } = render(page);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('Reminders are off');
  });
});

const optedInTarget = {
  ...optedOutTarget,
  optedOut: false,
};

describe('unsubscribe page — opted in', () => {
  beforeEach(() => {
    previewReminderOptOut.mockReset();
    previewReminderOptOut.mockResolvedValue(ok(optedInTarget));
  });

  it('shows the failure message when error=off after a failed opt-out', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok', error: 'off' }),
    });
    const { container } = render(page);
    expect(container.textContent).toContain(OFF_ERROR);
  });

  it('does not show the failure message for a stale error=on on the confirm page', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok', error: 'on' }),
    });
    const { container } = render(page);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

// The page is marked with the signup's language, from the row the token was
// checked against, by the rule the signup's own page uses (`signupLocale`).
describe("unsubscribe page — the signup's language", () => {
  afterEach(() => {
    request.instanceDefault = undefined;
    request.pathLocale = 'en';
  });

  async function mainLang(searchParams: Record<string, string>) {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve(searchParams),
    });
    return render(page).container.querySelector('main')?.getAttribute('lang');
  }

  it.each([
    ['opted in', optedInTarget],
    ['opted out', optedOutTarget],
  ])('marks the page with the signup’s language when %s', async (_, target) => {
    ship('participant', ['en', 'sv']);
    previewReminderOptOut.mockResolvedValue(ok({ ...target, signupLocale: 'sv' }));
    expect(await mainLang({ p: 'par_1', token: 'tok' })).toBe('sv');
  });

  it("stays English for a stored language that hasn't shipped", async () => {
    previewReminderOptOut.mockResolvedValue(ok({ ...optedInTarget, signupLocale: 'sv' }));
    expect(await mainLang({ p: 'par_1', token: 'tok' })).toBe('en');
  });

  it("takes the instance's language for a signup with none, once it has shipped", async () => {
    ship('participant', ['en', 'sv']);
    request.instanceDefault = 'sv';
    previewReminderOptOut.mockResolvedValue(ok(optedInTarget));
    expect(await mainLang({ p: 'par_1', token: 'tok' })).toBe('sv');
  });

  // No row to read, so the language of the signup the path names, as a
  // broken edit link's page has it.
  it('marks a link that is not valid, or is incomplete, with the path’s language', async () => {
    request.pathLocale = 'sv';
    previewReminderOptOut.mockResolvedValue(err(serviceError('forbidden', 'not valid')));
    expect(await mainLang({ p: 'par_1', token: 'bad' })).toBe('sv');
    expect(await mainLang({ p: 'par_1' })).toBe('sv');
  });
});

async function renderPage(searchParams: Record<string, string>) {
  render(
    await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

/** The page's sentence about the reminders, and its controls' names. */
function said() {
  return {
    heading: screen.getByRole('heading', { level: 1 }).textContent,
    sentence: document.querySelector('main p')?.textContent,
    bold: document.querySelector('main p strong')?.textContent,
    controls: [...document.querySelectorAll('main button, main a')]
      .map((control) => control.textContent)
      .join(' | '),
  };
}

// Each state of the page, as it read before its words moved to the catalog.
describe('unsubscribe page — its words in English', () => {
  afterEach(() => {
    cleanup();
    previewReminderOptOut.mockReset();
  });

  const withoutEmail = (target: typeof optedInTarget) => ({ ...target, participantEmail: null });

  it.each([
    [
      'asks before stopping',
      optedInTarget,
      {},
      {
        heading: 'Stop reminder emails?',
        sentence:
          "We'll stop sending dana@example.test reminders for Bake sale, and emails when the organizer changes your slot's date or time. This only affects this signup, and your slot stays as it is.",
        controls: 'Stop reminders | Keep them',
      },
    ],
    [
      'asks before stopping, for a participant without an email',
      withoutEmail(optedInTarget),
      {},
      {
        heading: 'Stop reminder emails?',
        sentence:
          "We'll stop sending reminders for Bake sale, and emails when the organizer changes your slot's date or time. This only affects this signup, and your slot stays as it is.",
        controls: 'Stop reminders | Keep them',
      },
    ],
    [
      'says reminders are back on',
      optedInTarget,
      { done: 'on' },
      {
        heading: 'Reminders turned back on',
        sentence:
          "You'll get reminders for Bake sale again at dana@example.test, and emails when your slot's date or time changes. You can stop them any time from the link in one.",
        controls: 'Stop reminders | Keep them',
      },
    ],
    [
      'says reminders are back on, for a participant without an email',
      withoutEmail(optedInTarget),
      { done: 'on' },
      {
        heading: 'Reminders turned back on',
        sentence:
          "You'll get reminders for Bake sale again, and emails when your slot's date or time changes. You can stop them any time from the link in one.",
        controls: 'Stop reminders | Keep them',
      },
    ],
    [
      'says reminders were just turned off',
      optedOutTarget,
      { done: 'off' },
      {
        heading: 'Reminders turned off',
        sentence:
          "You won't get any more reminders for Bake sale, or emails when the organizer changes your slot's date or time. Your slot is unchanged — if you also want to give it up, open the link in your confirmation email and cancel there.",
        controls: 'Turn reminders back on | Back to the signup',
      },
    ],
    [
      'says reminders are off',
      optedOutTarget,
      {},
      {
        heading: 'Reminders are off',
        sentence:
          "Reminders for Bake sale are off for dana@example.test. You won't get reminders about it, or emails when the organizer changes your slot's date or time.",
        controls: 'Turn reminders back on | Back to the signup',
      },
    ],
    [
      'says reminders are off, for a participant without an email',
      withoutEmail(optedOutTarget),
      {},
      {
        heading: 'Reminders are off',
        sentence:
          "Reminders for Bake sale are off. You won't get reminders about it, or emails when the organizer changes your slot's date or time.",
        controls: 'Turn reminders back on | Back to the signup',
      },
    ],
  ])('%s', async (_, target, params, expected) => {
    previewReminderOptOut.mockResolvedValue(ok(target));
    await renderPage({ p: 'par_1', token: 'tok', ...params });
    expect(said()).toEqual({ ...expected, bold: 'Bake sale' });
  });

  it('explains a link it can’t use', async () => {
    await renderPage({ p: 'par_1' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link is incomplete');
    expect(
      screen.getByText(
        'Unsubscribe links only work in full. Open the link straight from your reminder email, or reply to the organizer to ask them to stop.',
      ),
    ).toBeInTheDocument();

    cleanup();
    previewReminderOptOut.mockResolvedValue(err(serviceError('forbidden', 'not valid')));
    await renderPage({ p: 'par_1', token: 'bad' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("This link isn't valid");
    expect(
      screen.getByText(
        'It may have been mangled in transit, or the signup may have been deleted. Open the link straight from your reminder email, or reply to the organizer to ask them to stop.',
      ),
    ).toBeInTheDocument();
  });
});

describe('unsubscribe page — its words in the signup’s language', () => {
  const sv = (key: string) => `participant.unsubscribe.${key} in sv`;
  const noEmail = { participantEmail: null };

  afterEach(() => {
    cleanup();
    previewReminderOptOut.mockReset();
    request.pathLocale = 'en';
  });

  it.each<{
    state: string;
    target: object;
    params: Record<string, string>;
    title: string;
    body: string;
    controls: string[];
  }>([
    {
      state: 'asking',
      target: optedInTarget,
      params: {},
      title: 'confirm.title',
      body: 'confirm.bodyWithEmail',
      controls: ['stop', 'keep'],
    },
    {
      state: 'asking, without an email',
      target: { ...optedInTarget, ...noEmail },
      params: {},
      title: 'confirm.title',
      body: 'confirm.body',
      controls: ['stop', 'keep'],
    },
    {
      state: 'back on',
      target: optedInTarget,
      params: { done: 'on' },
      title: 'turnedOn.title',
      body: 'turnedOn.bodyWithEmail',
      controls: ['stop', 'keep'],
    },
    {
      state: 'back on, without an email',
      target: { ...optedInTarget, ...noEmail },
      params: { done: 'on' },
      title: 'turnedOn.title',
      body: 'turnedOn.body',
      controls: ['stop', 'keep'],
    },
    {
      state: 'just turned off',
      target: optedOutTarget,
      params: { done: 'off' },
      title: 'turnedOff.title',
      body: 'turnedOff.body',
      controls: ['turnBackOn', 'back'],
    },
    {
      state: 'off',
      target: optedOutTarget,
      params: {},
      title: 'areOff.title',
      body: 'areOff.bodyWithEmail',
      controls: ['turnBackOn', 'back'],
    },
    {
      state: 'off, without an email',
      target: { ...optedOutTarget, ...noEmail },
      params: {},
      title: 'areOff.title',
      body: 'areOff.body',
      controls: ['turnBackOn', 'back'],
    },
  ])(
    'takes every word from the catalog when $state',
    async ({ target, params, title, body, controls }) => {
      ship('participant', ['en', 'sv']);
      previewReminderOptOut.mockResolvedValue(ok({ ...target, signupLocale: 'sv' }));
      await renderPage({ p: 'par_1', token: 'tok', ...params });
      expect(said()).toEqual({
        heading: sv(title),
        sentence: sv(body),
        // The stand-in leaves the tags out, so no bold title to find.
        bold: undefined,
        controls: controls.map(sv).join(' | '),
      });
    },
  );

  it.each([
    ['back on', optedOutTarget, 'on', 'turnOnFailed'],
    ['off', optedInTarget, 'off', 'turnOffFailed'],
  ] as const)(
    'says turning reminders %s failed in the catalog’s words',
    async (...[, target, error, key]) => {
      ship('participant', ['en', 'sv']);
      previewReminderOptOut.mockResolvedValue(ok({ ...target, signupLocale: 'sv' }));
      await renderPage({ p: 'par_1', token: 'tok', error });
      expect(screen.getByRole('alert')).toHaveTextContent(sv(key));
    },
  );

  it('explains a link it can’t use in the language of the signup the path names', async () => {
    request.pathLocale = 'sv';
    await renderPage({ p: 'par_1' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(sv('incomplete.title'));
    expect(screen.getByText(sv('incomplete.body'))).toBeInTheDocument();

    cleanup();
    previewReminderOptOut.mockResolvedValue(err(serviceError('forbidden', 'not valid')));
    await renderPage({ p: 'par_1', token: 'bad' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(sv('invalid.title'));
    expect(screen.getByText(sv('invalid.body'))).toBeInTheDocument();
  });
});

// The tab's title: from the path's signup, which is the token's whenever the
// page shows (a wrong slug is redirected), without a statement of its own.
describe('unsubscribe page — its title', () => {
  afterEach(() => {
    request.pathLocale = 'en';
  });

  it('is “Reminder emails” in English', async () => {
    expect(await generateMetadata()).toEqual({
      title: 'Reminder emails',
      robots: { index: false, follow: false },
    });
  });

  it('is the catalog’s in the language of the signup the path names', async () => {
    request.pathLocale = 'sv';
    expect((await generateMetadata()).title).toBe('participant.unsubscribe.title in sv');
  });
});
