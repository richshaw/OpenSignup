// @vitest-environment jsdom
import { render } from '@testing-library/react';
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
vi.mock('@/i18n/server', () => ({ instanceDefaultLocale: () => request.instanceDefault }));
vi.mock('../signup-locale', () => ({ requestedSignupLocale: async () => request.pathLocale }));

const { default: UnsubscribePage } = await import('./page');

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
// Its words stay English until #630 moves them.
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
