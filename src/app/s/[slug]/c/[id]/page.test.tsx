// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CatalogLocale } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';
import { ok } from '@/lib/result';
import { formatSlotDate } from '@/lib/slot-label';

// The sign-up the edit link's token opens, as `getOwnCommitment` gives it,
// the instance's DEFAULT_LOCALE (none unless a test sets one), and the
// language of the signup the path names, which the tab's title reads.
const request = vi.hoisted(() => ({
  status: 'confirmed',
  participantEmail: 'pat@example.com' as string | null,
  signupLocale: null as string | null,
  instanceDefault: undefined as string | undefined,
  pathLocale: 'en',
  closed: false,
  state: { movedTo: null as string | null, removed: false, slot: 'open' },
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
      participantEmail: request.participantEmail,
      signupSlug: 'snack-duty',
      signupLocale: request.signupLocale,
    }),
  editLimitsForCommitment: services.editLimitsForCommitment,
  cancelledCommitmentState: services.cancelledCommitmentState,
}));
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => request.instanceDefault,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));
vi.mock('../../signup-locale', () => ({ requestedSignupLocale: async () => request.pathLocale }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
// A moved sign-up's link: its token, and the site's address.
vi.mock('@/lib/token', () => ({ editTokenFor: (id: string) => `token-for-${id}` }));
vi.mock('@/lib/links', async (importOriginal) => {
  const links = await importOriginal<typeof import('@/lib/links')>();
  return {
    ...links,
    commitmentEditUrl: (slug: string, id: string, token: string) =>
      `https://signup.example${links.commitmentEditPath(slug, id, token)}`,
  };
});
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
    closed: request.closed,
    slotName: slotNameIn(locale),
  }),
);
services.cancelledCommitmentState.mockImplementation(
  async (_db: unknown, _c: unknown, locale: CatalogLocale) => ({
    ...request.state,
    slotName: slotNameIn(locale),
  }),
);

const { default: CommitmentEditPage, generateMetadata } = await import('./page');

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
  request.participantEmail = 'pat@example.com';
  request.signupLocale = null;
  request.instanceDefault = undefined;
  request.pathLocale = 'en';
  request.closed = false;
  request.state = { movedTo: null, removed: false, slot: 'open' };
});

// The language comes from the signup the token was checked against, by the
// rule the signup's own page uses (`signupLocale`), so the edit page reads a
// slot's date as that page does, and its words are that language's.
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

describe('the edit page’s words', () => {
  it('reads as before in English', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Your spot$/);
    expect(screen.getByRole('link', { name: '← Back to signup' })).toHaveAttribute(
      'href',
      '/s/snack-duty',
    );
    expect(
      screen.getByText("You're editing this as Pat Example (pat@example.com)."),
    ).toBeInTheDocument();
    // The form, in the page's language.
    expect(screen.getByLabelText('Your name')).toHaveValue('Pat Example');
    expect(screen.getByText('You can have up to 4 spots on this slot.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel signup' })).toBeInTheDocument();
  });

  it('leaves the address out when the sign-up has none', async () => {
    request.participantEmail = null;
    await renderPage();
    expect(screen.getByText("You're editing this as Pat Example.")).toBeInTheDocument();
  });

  it('says what still works once sign-ups have closed', async () => {
    request.closed = true;
    await renderPage();
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(
      "ClosedYou can't add more spots now, but you can still change your details, give spots back, or cancel.",
    );
  });

  it('takes every line from the catalog in the signup’s language', async () => {
    ship('participant', ['en', 'sv']);
    request.signupLocale = 'sv';
    request.closed = true;
    await renderPage();
    const main = screen.getByRole('main');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'participant.editPage.title in sv',
    );
    expect(screen.getByRole('link', { name: 'participant.editPage.back in sv' })).toBeVisible();
    expect(screen.getByText('participant.editPage.editingAsWithEmail in sv')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'participant.editPage.closedBanner.title in svparticipant.editPage.closedBanner.body in sv',
    );
    // The form's messages are the signup's language's, here the Swedish catalog's.
    expect(screen.getByLabelText('Ditt namn')).toHaveValue('Pat Example');
    expect(screen.getByText('Du kan ha upp till 4 platser på det här passet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spara' })).toBeInTheDocument();
    expect(main).not.toHaveTextContent(
      /Your spot|Back to|You're editing|Closed|You can|Save|Cancel/,
    );
  });

  it('names the sign-up without an address in the signup’s language too', async () => {
    ship('participant', ['en', 'sv']);
    request.signupLocale = 'sv';
    request.participantEmail = null;
    await renderPage();
    expect(screen.getByText('participant.editPage.editingAs in sv')).toBeInTheDocument();
  });
});

describe('the cancelled page’s words', () => {
  it.each([
    ['open', 'There’s still room if you want to sign up again.'],
    ['full', 'The slot has filled up since.'],
    ['slotClosed', 'The slot has closed.'],
    ['signupClosed', 'The signup has closed.'],
  ])('reads as before in English for a slot that is %s', async (slot, body) => {
    request.status = 'cancelled';
    request.state = { movedTo: null, removed: false, slot };
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your spot was cancelled');
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the signup' })).toHaveAttribute(
      'href',
      '/s/snack-duty',
    );
  });

  it('reads as before in English when the organizer took them off', async () => {
    request.status = 'cancelled';
    request.state = { movedTo: null, removed: true, slot: 'open' };
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'The organizer took you off this slot',
    );
    expect(
      screen.getByText('If you think this is a mistake, contact the organizer.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the signup' })).toBeVisible();
  });

  it('reads as before in English when the sign-up moved, and links to the new one', async () => {
    request.status = 'cancelled';
    request.state = { movedTo: 'com_2', removed: false, slot: 'open' };
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Your spot moved to another slot',
    );
    expect(
      screen.getByText('You’re still signed up. Use the link below to see or change it.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See your new spot' })).toHaveAttribute(
      'href',
      'https://signup.example/s/snack-duty/c/com_2?token=token-for-com_2',
    );
  });

  it('takes its words from the catalog in the signup’s language', async () => {
    ship('participant', ['en', 'sv']);
    request.signupLocale = 'sv';
    request.status = 'cancelled';
    request.state = { movedTo: null, removed: false, slot: 'full' };
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'participant.cancelledPage.title in sv',
    );
    expect(screen.getByText('participant.cancelledPage.full in sv')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'participant.cancelledPage.back in sv' }),
    ).toBeVisible();

    cleanup();
    request.state = { movedTo: 'com_2', removed: false, slot: 'open' };
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'participant.cancelledPage.moved.title in sv',
    );
    expect(
      screen.getByRole('link', { name: 'participant.cancelledPage.moved.link in sv' }),
    ).toBeVisible();
  });
});

// The tab's title: from the path's signup, which is the token's whenever the
// page shows (a wrong slug is redirected), without a statement of its own.
describe('the edit page’s title', () => {
  it('is “Your spot” in English', async () => {
    expect(await generateMetadata()).toEqual({
      title: 'Your spot',
      robots: { index: false, follow: false },
    });
  });

  it('is the catalog’s in the language of the signup the path names', async () => {
    request.pathLocale = 'sv';
    expect((await generateMetadata()).title).toBe('participant.editPage.title in sv');
  });
});
