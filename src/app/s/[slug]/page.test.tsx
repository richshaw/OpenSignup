// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { type Audience, SHIPPED } from '@/i18n/config';
import { serviceError } from '@/lib/errors';
import { err, ok } from '@/lib/result';
import { formatSlotDate } from '@/lib/slot-label';

// Only English has shipped to participants today. The tests that need a
// second language ship Swedish by changing the list itself, as the page and
// the Settings tab both read it.
const shippedToday = [...SHIPPED.participant];
function ship(locales: string[]) {
  (SHIPPED as Record<Audience, readonly string[]>).participant = locales;
}

// The signup at the slug as stored, or null for none, and the instance's
// DEFAULT_LOCALE (none unless a test sets one).
const request = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  instanceDefault: undefined as string | undefined,
}));
vi.mock('@/i18n/server', () => ({ instanceDefaultLocale: () => request.instanceDefault }));

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

// A visitor: no session, no returning-participant cookie, no sign-ups.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  // The commit dialog's.
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/auth/session', () => ({
  getOrganizerSession: async () => null,
  toActor: () => ({ kind: 'anonymous' }),
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

const SWEDISH_DATE = formatSlotDate('2026-05-17', 'sv')!;
const ENGLISH_DATE = formatSlotDate('2026-05-17', 'en')!;

afterEach(() => {
  cleanup();
  ship(shippedToday);
  request.row = null;
  request.instanceDefault = undefined;
});

describe('the public signup page, in its signup’s language', () => {
  it('reads a Swedish signup’s dates in Swedish, and marks the page so', async () => {
    ship(['en', 'sv']);
    storeSignup({ settings: { locale: 'sv' } });
    await renderPage();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'sv');
    expect(screen.getByText(SWEDISH_DATE)).toBeInTheDocument();
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
    storeSignup({ settings: { locale: 'sv' } });
    await renderPage();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    expect(screen.getByText(ENGLISH_DATE)).toBeInTheDocument();

    cleanup();
    ship(['en', 'sv']);
    request.instanceDefault = 'sv';
    storeSignup({ settings: { locale: 'de' } });
    await renderPage();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'sv');
    expect(screen.getByText(SWEDISH_DATE)).toBeInTheDocument();
  });

  it.each([
    ['a draft', 'draft', 'This signup isn’t ready yet'],
    ['an archived signup', 'archived', 'This signup is no longer available'],
  ])(
    'tells a visitor about %s in its language, and nothing else of it',
    async (_, status, heading) => {
      ship(['en', 'sv']);
      storeSignup({
        status,
        title: 'Secret plans',
        description: 'Not for visitors',
        settings: { locale: 'sv' },
      });
      await renderPage();
      expect(screen.getByRole('main')).toHaveAttribute('lang', 'sv');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(heading);
      expect(document.body).not.toHaveTextContent(/Secret plans|Not for visitors/);
    },
  );
});

describe('the public signup page’s metadata', () => {
  const robots = { index: false, follow: false };

  it('names an English signup’s language for link previews, and nothing else changes', async () => {
    storeSignup({});
    expect(await generateMetadata(params)).toEqual({
      title: 'Snack duty',
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

  it('names a Swedish signup’s language as link previews write it', async () => {
    ship(['en', 'sv']);
    storeSignup({ settings: { locale: 'sv' } });
    const meta = await generateMetadata(params);
    expect(meta.openGraph).toMatchObject({ locale: 'sv_SE' });
  });

  it('gives a draft only the plain title, as before', async () => {
    ship(['en', 'sv']);
    storeSignup({ status: 'draft', settings: { locale: 'sv' } });
    expect(await generateMetadata(params)).toEqual({ title: 'Sign up', robots });
  });
});
