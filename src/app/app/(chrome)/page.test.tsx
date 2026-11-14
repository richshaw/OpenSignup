// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import en from '@/messages/en.json';
import sv from '@/messages/sv.json';
import { recordFindings } from '@/i18n/testing/catalog-check';
import { ship } from '@/i18n/testing/ship';
import { loadTranslatedFrom, TRANSLATED_FROM_DIR } from '@/i18n/testing/translated-from';
import type { SignupSummary } from '@/services/signups';

// What the page reads: the session (with the organizer's saved language), the
// instance's language (none, unless a test sets one), the browser's
// Accept-Language, the workspace's signups, and, when those don't settle it,
// the start of their descriptions.
const request = vi.hoisted(() => ({
  instanceDefault: undefined as string | undefined,
  acceptLanguage: null as string | null,
  saved: null as string | null,
  titles: [] as string[],
  descriptions: [] as string[],
}));
vi.mock('@/i18n/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/server')>()),
  instanceDefaultLocale: () => request.instanceDefault,
}));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(
      request.acceptLanguage === null ? {} : { 'accept-language': request.acceptLanguage },
    ),
}));
const actor = { kind: 'organizer', id: 'org_1' };
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({
    email: 'pat@example.com',
    defaultWorkspaceId: 'ws_1',
    locale: request.saved,
  }),
  toActor: () => actor,
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
const listDescriptionStarts = vi.hoisted(() =>
  vi.fn(async (_db: unknown, _actor: unknown, _workspaceId: string) => ({
    ok: true as const,
    value: request.descriptions,
  })),
);
vi.mock('@/services/signups', () => ({
  listSignupSummariesForWorkspace: async () => ({
    ok: true,
    value: request.titles.map(
      (title, i): SignupSummary => ({
        id: `sig_${i}`,
        slug: `signup-${i}`,
        title,
        status: 'open',
        closesAt: null,
        createdAt: new Date('2026-11-01T09:00:00Z'),
        updatedAt: new Date('2026-11-01T09:00:00Z'),
      }),
    ),
  }),
  listDescriptionStarts,
}));
const trackOrganizerView = vi.hoisted(() => vi.fn(async (_args: unknown) => {}));
vi.mock('@/lib/view-tracker', () => ({ trackOrganizerView }));
const answerSwedishNoticeAction = vi.hoisted(() => vi.fn());
vi.mock('./actions', () => ({ answerSwedishNoticeAction }));

const { default: DashboardPage } = await import('./page');

async function renderPage() {
  return render(await DashboardPage());
}

const notice = () => screen.queryByText('Your signups can be in Swedish now.')?.parentElement;

afterEach(() => {
  cleanup();
  Object.assign(request, {
    instanceDefault: undefined,
    acceptLanguage: null,
    saved: null,
    titles: [],
    descriptions: [],
  });
  listDescriptionStarts.mockClear();
  trackOrganizerView.mockClear();
});

/** What the page told the view tracker to record, if anything. */
const recorded = () => trackOrganizerView.mock.calls.map(([args]) => args);
const shownBecause = (reason: string) => [
  {
    actor,
    signupId: null,
    workspaceId: null,
    eventType: 'language_notice.shown',
    payload: { reason },
    once: true,
  },
];

describe('Your signups: the notice that offers Swedish', () => {
  it('shows for a browser whose first language is Swedish, with no read', async () => {
    ship('participant', ['en', 'sv']);
    request.acceptLanguage = 'sv-SE,en;q=0.8';
    request.titles = ['Bake sale'];
    await renderPage();

    expect(notice()).toBeInTheDocument();
    expect(listDescriptionStarts).not.toHaveBeenCalled();
    expect(recorded()).toEqual(shownBecause('browser'));
  });

  it('says it in Swedish too, and each button saves a language', async () => {
    ship('participant', ['en', 'sv']);
    request.acceptLanguage = 'sv';
    await renderPage();

    const box = within(notice()!);
    const swedish = box.getByText('Nu kan dina anmälningslistor vara på svenska.');
    expect(swedish).toHaveAttribute('lang', 'sv');
    // The title's twin, in the title, ahead of the explanation.
    const title = box.getByText('Your signups can be in Swedish now.');
    expect(title).toContainElement(swedish);
    expect(title).toHaveTextContent(
      'Your signups can be in Swedish now. Nu kan dina anmälningslistor vara på svenska.',
    );
    const explanation = box.getByText(/^Choose the language your new signups start in/);
    expect(
      title.compareDocumentPosition(explanation) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const use = box.getByRole('button', { name: 'Use Swedish' });
    const keep = box.getByRole('button', { name: 'Keep English' });
    // Each is a plain form with the language it saves, and nothing else.
    for (const [button, locale] of [
      [use, 'sv'],
      [keep, 'en'],
    ] as const) {
      const form = button.closest('form')!;
      expect(Object.fromEntries(new FormData(form))).toEqual({ locale });
    }
    // Part of the page, not an announcement.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows for signups whose titles look Swedish, with no read', async () => {
    ship('participant', ['en', 'sv']);
    request.acceptLanguage = 'en-GB,en;q=0.9';
    request.titles = ['Bake sale', 'Kakor till fikat och kaffe'];
    await renderPage();

    expect(notice()).toBeInTheDocument();
    expect(listDescriptionStarts).not.toHaveBeenCalled();
    expect(recorded()).toEqual(shownBecause('titles'));
  });

  it('when the titles don’t settle it, reads the descriptions once, and shows for a Swedish one', async () => {
    ship('participant', ['en', 'sv']);
    request.acceptLanguage = 'en';
    request.titles = ['Julpyssel', 'Bake sale'];
    request.descriptions = ['Bring a dish.', 'Vi pysslar och fikar efter skolan.'];
    await renderPage();

    expect(notice()).toBeInTheDocument();
    expect(listDescriptionStarts).toHaveBeenCalledOnce();
    expect(listDescriptionStarts).toHaveBeenCalledWith({}, actor, 'ws_1');
    expect(recorded()).toEqual(shownBecause('descriptions'));
  });

  it('doesn’t show for English titles and descriptions, or a browser that only ranks Swedish second', async () => {
    ship('participant', ['en', 'sv']);
    request.acceptLanguage = 'en-US,sv;q=0.9';
    request.titles = ['Bake sale', 'Carpool to Malmö'];
    request.descriptions = ['Bring a dish to share at Åsa’s.'];
    await renderPage();

    expect(notice()).toBeUndefined();
    expect(listDescriptionStarts).toHaveBeenCalledOnce();
    expect(trackOrganizerView).not.toHaveBeenCalled();
  });

  it('never lets descriptions count against titles that look Swedish', async () => {
    ship('participant', ['en', 'sv']);
    // A title spelled only with Swedish letters, alone: enough by itself.
    request.titles = ['Föräldramöte'];
    request.descriptions = ['Parents’ evening. Bring questions.', 'Snacks provided.'];
    await renderPage();

    expect(notice()).toBeInTheDocument();
    expect(listDescriptionStarts).not.toHaveBeenCalled();
  });

  it('reads nothing for a workspace with no signups', async () => {
    ship('participant', ['en', 'sv']);
    request.acceptLanguage = 'en';
    await renderPage();

    expect(notice()).toBeUndefined();
    expect(listDescriptionStarts).not.toHaveBeenCalled();
  });

  it('doesn’t show once a language is saved, whichever it is', async () => {
    ship('participant', ['en', 'sv']);
    request.acceptLanguage = 'sv';
    request.titles = ['Kakor till fikat'];
    request.descriptions = ['Vi behöver hjälp och kakor.'];
    for (const saved of ['en', 'sv', 'xx']) {
      request.saved = saved;
      await renderPage();
      expect(notice(), saved).toBeUndefined();
      cleanup();
    }
    expect(listDescriptionStarts).not.toHaveBeenCalled();
    expect(trackOrganizerView).not.toHaveBeenCalled();
  });

  it('doesn’t show when the instance has a language, English or Swedish', async () => {
    ship('participant', ['en', 'sv']);
    request.acceptLanguage = 'sv';
    request.titles = ['Kakor till fikat'];
    request.descriptions = ['Vi behöver hjälp och kakor.'];
    for (const instanceDefault of ['en', 'sv']) {
      request.instanceDefault = instanceDefault;
      await renderPage();
      expect(notice(), instanceDefault).toBeUndefined();
      cleanup();
    }
    expect(listDescriptionStarts).not.toHaveBeenCalled();
    expect(trackOrganizerView).not.toHaveBeenCalled();
  });

  it('doesn’t show while Swedish hasn’t shipped, and reads nothing for it', async () => {
    request.acceptLanguage = 'sv';
    request.titles = ['Kakor till fikat'];
    request.descriptions = ['Vi behöver hjälp och kakor.'];
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Your signups' })).toBeInTheDocument();
    expect(screen.getByText('Kakor till fikat')).toBeInTheDocument();
    expect(notice()).toBeUndefined();
    expect(listDescriptionStarts).not.toHaveBeenCalled();
    expect(trackOrganizerView).not.toHaveBeenCalled();
  });

  it('has a Swedish line translated from the English it shows', () => {
    // The catalog check fails a stale message only in a language shipped to
    // the audience that reads it, and organizer text isn't shipped in Swedish.
    // This line is shown once Swedish ships to participants, so it's checked
    // here: change the English, and translate and mark the Swedish again.
    const key = 'organizer.swedishNotice.title';
    const record = loadTranslatedFrom(
      path.resolve(import.meta.dirname, '../../../..', TRANSLATED_FROM_DIR),
    );
    const findings = recordFindings(en, sv, record.sv ?? {}).filter((f) => f.key === key);
    expect(findings).toEqual([]);
    expect(record.sv?.[key]).toBe(en.organizer.swedishNotice.title);
  });
});
