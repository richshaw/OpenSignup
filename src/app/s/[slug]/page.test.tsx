// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CATALOG_LOCALES } from '@/i18n/config';
import { OTHER_LANGUAGE, OTHER_LOCALE } from '@/i18n/testing/locales';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { serviceError } from '@/lib/errors';
import { err, ok } from '@/lib/result';
import { INSTANCE_NAME } from '@/lib/site-config';
import { openGraphLocale } from '@/i18n/config';
import { formatSlotDate } from '@/lib/slot-label';
import { findDraftForOrganizer } from '@/services/signups';

// The signup at the slug as stored, or null for none, the instance's
// DEFAULT_LOCALE (none unless a test sets one), and who is looking (a visitor
// unless a test signs an organizer in).
const request = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  instanceDefault: undefined as string | undefined,
  actor: { kind: 'anonymous' } as Record<string, unknown>,
  /** The language stored on the signed-in organizer's account. */
  organizerLocale: null as string | null,
}));
// English from the catalog; any other language answers each key with where
// it was asked for ("participant.signupPage.title in sv"), so a test sees which
// text is asked for in it.
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => request.instanceDefault,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

// The cached loaders, answering as `getSignupRowBySlug` and `getPublicSignup`
// do: a draft or an archived signup is `not_found` with `received`, and only
// an open one comes with its fields and slots.
const FIELDS = [{ id: 'fld_1', ref: 'date', label: 'Date', fieldType: 'date', sortOrder: 0 }];
const SLOTS = [
  {
    id: 'slot_1',
    ref: 'slot_1',
    values: { date: '2026-05-17' },
    slotAt: null,
    capacity: 2,
    status: 'open',
  },
];
vi.mock('@/services/signups.cached', () => ({
  loadSignupRowBySlug: async () => request.row,
  loadPublicSignup: async () => {
    const row = request.row;
    if (!row) return err(serviceError('not_found', 'signup not found'));
    if (row.status === 'draft' || row.status === 'archived') {
      return err(serviceError('not_found', 'not shown', { received: row.status }));
    }
    return ok({ ...row, fields: FIELDS, slots: SLOTS, committedBySlot: {} });
  },
}));

// No returning-participant cookie, no sign-ups.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  // The commit dialog's.
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/auth/session', () => ({
  getOrganizerSession: async () =>
    request.actor.kind === 'organizer' ? { locale: request.organizerLocale } : null,
  toActor: () => request.actor,
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/services/commitments', () => ({ getOwnCommitmentsForSignup: async () => [] }));
vi.mock('@/services/signups', () => ({ findDraftForOrganizer: vi.fn() }));
vi.mock('@/lib/view-tracker', () => ({
  recordPublicView: vi.fn(),
  trackAfterResponse: async () => {},
}));

const { default: PublicSignupPage, generateMetadata } = await import('./page');

const params = { params: Promise.resolve({ slug: 'snack-duty' }) };

function storeSignup(over: Record<string, unknown>) {
  request.row = {
    id: 'sig_1',
    slug: 'snack-duty',
    workspaceId: 'ws_1',
    title: 'Snack duty',
    description: 'Fruit for the team',
    status: 'open',
    closesAt: null,
    deletedAt: null,
    settings: {},
    ...over,
  };
}

async function renderPage() {
  render(await PublicSignupPage(params));
}

const OTHER_DATE = formatSlotDate('2026-05-17', OTHER_LOCALE)!;
const ENGLISH_DATE = formatSlotDate('2026-05-17', 'en')!;

/** Signs in an organizer of the signup's workspace. */
function signInItsOrganizer() {
  request.actor = {
    kind: 'organizer',
    id: 'org_1',
    email: 'pat@example.com',
    workspaceIds: ['ws_1'],
    workspaceRoles: { ws_1: 'owner' },
  };
}

/** Where the mocked translator says text in the other language was asked for. */
const inOther = (key: string) => `participant.signupPage.${key} in ${OTHER_LOCALE}`;

afterEach(() => {
  cleanup();
  request.row = null;
  request.instanceDefault = undefined;
  request.actor = { kind: 'anonymous' };
  request.organizerLocale = null;
  vi.mocked(findDraftForOrganizer).mockReset();
});

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

describe('the public signup page, in its signup’s language', () => {
  it(`reads a ${OTHER_LANGUAGE} signup’s dates in ${OTHER_LANGUAGE}, and marks the page so`, async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    storeSignup({ settings: { locale: OTHER_LOCALE } });
    await renderPage();
    expect(screen.getByRole('main')).toHaveAttribute('lang', OTHER_LOCALE);
    expect(screen.getByText(OTHER_DATE)).toBeInTheDocument();
    expect(screen.queryByText(ENGLISH_DATE)).toBeNull();
  });

  it('leaves an English signup as it was', async () => {
    storeSignup({ settings: { locale: 'en' } });
    await renderPage();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    expect(screen.getByText(ENGLISH_DATE)).toBeInTheDocument();
  });

  // As the Settings tab shows it: the choice there is the language here.
  it('reads a stored language that hasn’t shipped as the instance’s', async () => {
    shipOnlyEnglish();
    storeSignup({ settings: { locale: OTHER_LOCALE } });
    await renderPage();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    expect(screen.getByText(ENGLISH_DATE)).toBeInTheDocument();

    cleanup();
    ship('participant', ['en', OTHER_LOCALE]);
    request.instanceDefault = OTHER_LOCALE;
    storeSignup({ settings: { locale: 'de' } });
    await renderPage();
    expect(screen.getByRole('main')).toHaveAttribute('lang', OTHER_LOCALE);
    expect(screen.getByText(OTHER_DATE)).toBeInTheDocument();
  });

  it.each([
    ['a draft', 'draft'],
    ['an archived signup', 'archived'],
  ])('tells a visitor about %s in its language, and nothing else of it', async (_, status) => {
    ship('participant', ['en', OTHER_LOCALE]);
    storeSignup({
      status,
      title: 'Secret plans',
      description: 'Not for visitors',
      settings: { locale: OTHER_LOCALE },
    });
    await renderPage();
    expect(screen.getByRole('main')).toHaveAttribute('lang', OTHER_LOCALE);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(inOther(`${status}.title`));
    expect(screen.getByText(inOther(`${status}.body`))).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Secret plans|Not for visitors/);
  });

  it.each([
    [
      'draft',
      'This signup isn’t ready yet',
      'The organizer hasn’t published it yet. This link will work once they do, so check back later.',
    ],
    [
      'archived',
      'This signup is no longer available',
      'The organizer has archived this signup. If you need to reach them, ask for a new link.',
    ],
  ])('words an English %s signup’s message as before', async (status, heading, body) => {
    storeSignup({ status });
    await renderPage();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(heading);
    expect(screen.getByText(body)).toBeInTheDocument();
  });
});

describe('the organizer’s own text on the public signup page', () => {
  it('tells a draft’s own organizer about it in English, quoting what visitors see', async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    signInItsOrganizer();
    vi.mocked(findDraftForOrganizer).mockResolvedValue(ok({ id: 'sig_1' }) as never);
    storeSignup({ status: 'draft', settings: { locale: OTHER_LOCALE } });
    await renderPage();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    // The organizer's other pages say it with the same words: Your signups
    // and the signup's header (src/components/signup/header-text.test.ts).
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Only you can see this draft',
    );
    expect(
      screen.getByText(
        `People who open this link see “${inOther('draft.title')}” until you publish it. Renaming the draft gives it a new link, so share it after you publish.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open your draft' })).toHaveAttribute(
      'href',
      '/app/signups/sig_1/build',
    );
  });

  it('words the own draft’s note as before on an English signup', async () => {
    signInItsOrganizer();
    vi.mocked(findDraftForOrganizer).mockResolvedValue(ok({ id: 'sig_1' }) as never);
    storeSignup({ status: 'draft' });
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Only you can see this draft',
    );
    expect(
      screen.getByText(
        'People who open this link see “This signup isn’t ready yet” until you publish it. Renaming the draft gives it a new link, so share it after you publish.',
      ),
    ).toBeInTheDocument();
  });

  // The stand-in translator answers in any language but English with where
  // the text was asked for, so these see which text is in the organizer's.
  it.each(OTHER_LANGUAGES)(
    'tells a draft’s own organizer about it in theirs, %s, marked so',
    async (other) => {
      ship('organizer', ['en', other]);
      signInItsOrganizer();
      request.organizerLocale = other;
      vi.mocked(findDraftForOrganizer).mockResolvedValue(ok({ id: 'sig_1' }) as never);
      storeSignup({ status: 'draft' });
      await renderPage();
      const own = (key: string) => `organizer.publicPage.ownDraft.${key} in ${other}`;
      expect(screen.getByRole('main')).toHaveAttribute('lang', other);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(own('title'));
      expect(screen.getByText(own('body'))).toBeInTheDocument();
      expect(screen.getByRole('link', { name: own('open') })).toHaveAttribute(
        'href',
        '/app/signups/sig_1/build',
      );
    },
  );

  it.each(OTHER_LANGUAGES)(
    'puts the strip in its organizer’s language, %s, over an English signup',
    async (other) => {
      ship('organizer', ['en', other]);
      signInItsOrganizer();
      request.organizerLocale = other;
      storeSignup({});
      await renderPage();
      const strip = screen.getByRole('navigation', {
        name: `organizer.publicPage.strip.label in ${other}`,
      });
      expect(strip).toHaveAttribute('lang', other);
      expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    },
  );

  it(`keeps the organizer strip in English over a ${OTHER_LANGUAGE} signup, marked so`, async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    signInItsOrganizer();
    storeSignup({ settings: { locale: OTHER_LOCALE } });
    await renderPage();
    const strip = screen.getByRole('navigation', { name: 'Organizer' });
    expect(strip).toHaveAttribute('lang', 'en');
    expect(strip).toHaveTextContent('Your signup. Only organizers see this bar.');
    expect(screen.getByRole('main')).toHaveAttribute('lang', OTHER_LOCALE);
  });
});

describe('the public signup page’s metadata', () => {
  const robots = { index: false, follow: false };
  // The page writes the site name into its tab title itself, since it shares
  // its segment with its root layout and so misses the layout's template.
  const tabTitle = (title: string) => ({ absolute: `${title} · ${INSTANCE_NAME}` });

  it('names an English signup’s language for link previews, and nothing else changes', async () => {
    storeSignup({});
    expect(await generateMetadata(params)).toEqual({
      title: tabTitle('Snack duty'),
      description: 'Fruit for the team',
      robots,
      openGraph: {
        title: 'Snack duty',
        description: 'Fruit for the team',
        type: 'website',
        locale: 'en_US',
      },
      twitter: { card: 'summary', title: 'Snack duty', description: 'Fruit for the team' },
    });
  });

  it(`names a ${OTHER_LANGUAGE} signup’s language as link previews write it`, async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    storeSignup({ settings: { locale: OTHER_LOCALE } });
    const meta = await generateMetadata(params);
    expect(meta.openGraph).toMatchObject({ locale: openGraphLocale(OTHER_LOCALE) });
  });

  it('gives a draft only the plain title, as before', async () => {
    storeSignup({ status: 'draft' });
    expect(await generateMetadata(params)).toEqual({ title: tabTitle('Sign up'), robots });
  });

  it(`gives a ${OTHER_LANGUAGE} draft the plain title in ${OTHER_LANGUAGE}`, async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    storeSignup({ status: 'draft', settings: { locale: OTHER_LOCALE } });
    expect(await generateMetadata(params)).toEqual({ title: tabTitle(inOther('title')), robots });
  });

  it('describes a signup with no description of its own in its language', async () => {
    storeSignup({ description: '' });
    expect((await generateMetadata(params)).description).toBe(`Sign up via ${INSTANCE_NAME}`);
    ship('participant', ['en', OTHER_LOCALE]);
    storeSignup({ description: '', settings: { locale: OTHER_LOCALE } });
    expect((await generateMetadata(params)).description).toBe(inOther('description'));
  });
});
