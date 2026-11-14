// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CatalogLocale } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';
import { ok } from '@/lib/result';
import { formatSlotDate } from '@/lib/slot-label';

// The sign-up the edit link's token opens, as `getOwnCommitment` gives it,
// and the instance's DEFAULT_LOCALE (none unless a test sets one).
const request = vi.hoisted(() => ({
  status: 'confirmed',
  signupLocale: null as string | null,
  instanceDefault: undefined as string | undefined,
}));

/** The slot's name as the services give it: its date read in `locale`. */
const slotNameIn = (locale: CatalogLocale) => `Juice · ${formatSlotDate('2027-05-03', locale)}`;

const services = vi.hoisted(() => ({
  editLimitsForCommitment: vi.fn(),
  cancelledCommitmentState: vi.fn(),
}));
vi.mock('@/services/commitments', () => ({
  ACTIVE_COMMITMENT_STATUSES: ['confirmed', 'tentative', 'waitlist'],
  getOwnCommitment: async () =>
    ok({
      id: 'com_1',
      signupId: 'sig_1',
      slotId: 'slot_1',
      workspaceId: 'ws_1',
      participantId: 'par_1',
      status: request.status,
      quantity: 1,
      notes: '',
      participantName: 'Pat Example',
      participantEmail: 'pat@example.com',
      signupSlug: 'snack-duty',
      signupLocale: request.signupLocale,
    }),
  editLimitsForCommitment: services.editLimitsForCommitment,
  cancelledCommitmentState: services.cancelledCommitmentState,
}));
vi.mock('@/i18n/server', () => ({ instanceDefaultLocale: () => request.instanceDefault }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/view-tracker', () => ({
  recordEditLinkFollowed: vi.fn(),
  trackAfterResponse: async () => {},
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: () => {
    throw new Error('NEXT_REDIRECT');
  },
  // The edit form's.
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

services.editLimitsForCommitment.mockImplementation(
  async (_db: unknown, _c: unknown, locale: CatalogLocale) => ({
    maxQuantity: 4,
    closed: false,
    slotName: slotNameIn(locale),
  }),
);
services.cancelledCommitmentState.mockImplementation(
  async (_db: unknown, _c: unknown, locale: CatalogLocale) => ({
    movedTo: null,
    removed: false,
    slot: 'open',
    slotName: slotNameIn(locale),
  }),
);

const { default: CommitmentEditPage } = await import('./page');

async function renderPage() {
  render(
    await CommitmentEditPage({
      params: Promise.resolve({ slug: 'snack-duty', id: 'com_1' }),
      searchParams: Promise.resolve({ token: 'tok' }),
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  request.status = 'confirmed';
  request.signupLocale = null;
  request.instanceDefault = undefined;
});

// The language comes from the signup the token was checked against, by the
// rule the signup's own page uses (`signupLocale`), so the edit page reads a
// slot's date as that page does. Its words stay English until #630 moves them.
describe("the edit page in its signup's language", () => {
  it("reads the slot's date in the signup's language, and marks the page with it", async () => {
    ship('participant', ['en', 'sv']);
    request.signupLocale = 'sv';
    await renderPage();
    expect(services.editLimitsForCommitment).toHaveBeenCalledWith({}, expect.anything(), 'sv');
    expect(screen.getByText(slotNameIn('sv'))).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'sv');
  });

  it("stays English for a stored language that hasn't shipped", async () => {
    request.signupLocale = 'sv';
    await renderPage();
    expect(services.editLimitsForCommitment).toHaveBeenCalledWith({}, expect.anything(), 'en');
    expect(screen.getByText(slotNameIn('en'))).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
  });

  it("takes the instance's language for a signup with none, once it has shipped", async () => {
    ship('participant', ['en', 'sv']);
    request.instanceDefault = 'sv';
    await renderPage();
    expect(services.editLimitsForCommitment).toHaveBeenCalledWith({}, expect.anything(), 'sv');
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'sv');
  });

  it("names a cancelled sign-up's slot in the signup's language", async () => {
    ship('participant', ['en', 'sv']);
    request.signupLocale = 'sv';
    request.status = 'cancelled';
    await renderPage();
    expect(services.cancelledCommitmentState).toHaveBeenCalledWith({}, expect.anything(), 'sv');
    expect(screen.getByText(slotNameIn('sv'))).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'sv');
  });
});
