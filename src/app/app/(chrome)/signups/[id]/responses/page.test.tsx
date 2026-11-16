// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { CATALOG_LOCALES } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';

// Unit tests have no server environment. The instance sets no language.
// English comes from the catalog; any other language answers with the key it
// was asked for and the language.
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => undefined,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

type Commitment = {
  id: string;
  slotId: string;
  participantName: string;
  participantEmail: string | null;
  status: string;
  quantity: number;
};

// The signup and its sign-ups as the page loads them, and what the page needs
// around it: a session, the view it records and the server action, which
// need a database.
const stored = vi.hoisted(() => ({
  status: 'open',
  commitments: [] as Commitment[],
  ended: new Map<string, 'removed' | 'moved'>(),
  /** The language stored on the organizer's account. */
  organizerLocale: null as string | null,
}));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({ locale: stored.organizerLocale }),
  toActor: () => ({ kind: 'anonymous' }),
}));
vi.mock('@/services/signups.cached', () => ({
  loadSignupForOrganizer: async () => ({
    ok: true,
    value: {
      id: 'sig_1',
      workspaceId: 'ws_1',
      status: stored.status,
      fields: [{ ref: 'what', label: 'What', fieldType: 'text' }],
      slots: [
        { id: 'slot_fruit', ref: 'fruit', values: { what: 'Fruit and water' } },
        // Nothing written in it yet, so it goes by its ref.
        { id: 'slot_blank', ref: 'slot-2', values: {} },
      ],
    },
  }),
}));
vi.mock('@/services/commitments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/commitments')>()),
  listCommitmentsForSignup: async () => stored.commitments,
  howCommitmentsEnded: async () => stored.ended,
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/view-tracker', () => ({ trackOrganizerView: async () => {} }));
vi.mock('../actions', () => ({ removeCommitmentAction: vi.fn() }));
// A submit button shows its loading label only while its form is pending,
// which a test can't hold. This one shows it as an attribute instead.
vi.mock('@/components/ui/async-submit-button', async () => {
  const { createElement } = await import('react');
  type Props = { loadingLabel: string; children: ReactNode };
  return {
    AsyncSubmitButton: ({ loadingLabel, children }: Props) =>
      createElement('button', { type: 'submit', 'data-loading-label': loadingLabel }, children),
  };
});

const { default: ResponsesTab } = await import('./page');

async function renderTab() {
  return render(await ResponsesTab({ params: Promise.resolve({ id: 'sig_1' }) }));
}

/** Every language with a catalog but English. */
const OTHER_LOCALES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

/**
 * Pat holds one spot, Sam two on the slot with nothing written in it, Kim one
 * on a slot that's gone. Ann was taken off, Bo cancelled.
 */
const SIGN_UPS: Commitment[] = [
  {
    id: 'com_pat',
    slotId: 'slot_fruit',
    participantName: 'Pat Example',
    participantEmail: 'pat@example.com',
    status: 'confirmed',
    quantity: 1,
  },
  {
    id: 'com_sam',
    slotId: 'slot_blank',
    participantName: 'Sam Example',
    participantEmail: null,
    status: 'confirmed',
    quantity: 2,
  },
  {
    id: 'com_kim',
    slotId: 'slot_gone',
    participantName: 'Kim Example',
    participantEmail: 'kim@example.com',
    status: 'confirmed',
    quantity: 1,
  },
  {
    id: 'com_ann',
    slotId: 'slot_fruit',
    participantName: 'Ann Example',
    participantEmail: 'ann@example.com',
    status: 'cancelled',
    quantity: 1,
  },
  {
    id: 'com_bo',
    slotId: 'slot_fruit',
    participantName: 'Bo Example',
    participantEmail: 'bo@example.com',
    status: 'cancelled',
    quantity: 1,
  },
];

afterEach(() => {
  cleanup();
  stored.status = 'open';
  stored.commitments = [];
  stored.ended = new Map();
  stored.organizerLocale = null;
});

/** What the tab should say, by part, in the language under test. */
interface Words {
  headers: readonly string[];
  summary: string;
  download: string;
  noEmail: string;
  /** The words after a row's spots on a phone, for 1 and for 2. */
  spot: string;
  spots: string;
  confirmed: string;
  removed: string;
  cancelled: string;
  removePat: string;
  removeSam: string;
  removeKim: string;
  questionPat: string;
  questionSam: string;
  remove: string;
  dialogLabel: string;
  keep: string;
  confirm: string;
  removing: string;
}

async function expectTab(words: Words) {
  stored.commitments = SIGN_UPS;
  stored.ended = new Map([['com_ann', 'removed']]);
  await renderTab();

  expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(words.headers);
  expect(screen.getByText(words.summary.split(' · ')[0]!).parentElement).toHaveTextContent(
    words.summary,
  );
  expect(screen.getByRole('link', { name: words.download })).toHaveAttribute(
    'href',
    '/api/signups/sig_1/export.csv',
  );

  const row = (name: string) => within(screen.getByRole('row', { name: new RegExp(name) }));
  const pat = row('Pat Example');
  expect(pat.getByRole('cell', { name: words.confirmed })).toBeInTheDocument();
  expect(pat.getByRole('cell', { name: `1 ${words.spot}` })).toBeInTheDocument();
  const removePat = pat.getByRole('button', { name: words.removePat });
  expect(removePat).toHaveTextContent(words.remove);
  // The question is in the page, though the dialog is closed.
  const dialog = pat.getByRole('alertdialog', { hidden: true });
  expect(dialog).toHaveAttribute('aria-label', words.dialogLabel);
  expect(within(dialog).getByText(words.questionPat)).toBeInTheDocument();
  expect(
    within(dialog).getByRole('button', { name: words.keep, hidden: true }),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: words.confirm, hidden: true })).toHaveAttribute(
    'data-loading-label',
    words.removing,
  );

  const sam = row('Sam Example');
  expect(sam.getByRole('cell', { name: words.noEmail })).toBeInTheDocument();
  expect(sam.getByRole('cell', { name: 'slot-2' })).toBeInTheDocument();
  expect(sam.getByRole('cell', { name: `2 ${words.spots}` })).toBeInTheDocument();
  expect(sam.getByRole('button', { name: words.removeSam })).toBeInTheDocument();
  expect(
    within(sam.getByRole('alertdialog', { hidden: true })).getByText(words.questionSam),
  ).toBeInTheDocument();

  const kim = row('Kim Example');
  expect(kim.getByRole('cell', { name: '—' })).toBeInTheDocument();
  expect(kim.getByRole('button', { name: words.removeKim })).toBeInTheDocument();

  // Off the slot: no Remove, and the status says how they left.
  const ann = row('Ann Example');
  expect(ann.getByRole('cell', { name: words.removed })).toBeInTheDocument();
  expect(ann.queryByRole('button')).not.toBeInTheDocument();
  expect(row('Bo Example').getByRole('cell', { name: words.cancelled })).toBeInTheDocument();
}

describe('Responses tab: its words', () => {
  it('reads as before in English, with no language stored', async () => {
    const after = 'up for someone else. They won’t get an email about it.';
    await expectTab({
      headers: ['Name', 'Email', 'Slot', 'Spots', 'Status', 'Actions'],
      summary: '3 sign-ups · 1 cancelled · 1 removed',
      download: 'Download CSV',
      noEmail: 'No email',
      spot: 'spot',
      spots: 'spots',
      confirmed: 'confirmed',
      removed: 'removed',
      cancelled: 'cancelled',
      removePat: 'Remove Pat Example from Fruit and water',
      removeSam: 'Remove Sam Example from slot-2',
      removeKim: 'Remove Kim Example from this slot',
      questionPat: `Remove Pat Example from Fruit and water? Their spot opens ${after}`,
      questionSam: `Remove Sam Example from slot-2? Their 2 spots open ${after}`,
      remove: 'Remove',
      dialogLabel: 'Confirm removal',
      keep: 'Keep',
      confirm: 'Yes, remove',
      removing: 'Removing…',
    });
  });

  it.each(OTHER_LOCALES)('is in the organizer’s language, %s', async (other) => {
    ship('organizer', ['en', other]);
    stored.organizerLocale = other;
    const say = (key: string) => `organizer.responses.${key} in ${other}`;
    await expectTab({
      headers: ['name', 'email', 'slot', 'spots', 'status', 'actions'].map((h) =>
        say(`table.${h}`),
      ),
      summary: ['summary.signUps', 'summary.cancelled', 'summary.removed'].map(say).join(' · '),
      download: say('downloadCsv'),
      noEmail: say('table.noEmail'),
      spot: say('table.spotsAfterCount'),
      spots: say('table.spotsAfterCount'),
      confirmed: say('status.confirmed'),
      removed: say('status.removed'),
      cancelled: say('status.cancelled'),
      removePat: say('remove.label'),
      removeSam: say('remove.label'),
      removeKim: say('remove.labelNoSlot'),
      questionPat: say('remove.question'),
      questionSam: say('remove.question'),
      remove: say('remove.button'),
      dialogLabel: say('remove.dialogLabel'),
      keep: say('remove.keep'),
      confirm: say('remove.confirm'),
      removing: say('remove.removing'),
    });
    // What participants gave and the signup holds stays as written.
    expect(screen.getByRole('cell', { name: 'pat@example.com' })).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: 'Fruit and water' })).toHaveLength(3);
  });
});

describe('Responses tab: nobody signed up', () => {
  const english = {
    draft: 'Nobody has signed up yet. People can sign up once you publish and share it.',
    open: 'Nobody has signed up yet. Share the public link to start collecting.',
    closed: 'Nobody signed up.',
    archived: 'Nobody signed up. People can’t sign up now.',
  };

  it.each(Object.entries(english))('says so for a %s signup, as before', async (status, line) => {
    stored.status = status;
    await renderTab();
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it.each(OTHER_LOCALES)('says so in the organizer’s language, %s', async (other) => {
    ship('organizer', ['en', other]);
    stored.organizerLocale = other;
    for (const status of Object.keys(english)) {
      stored.status = status;
      await renderTab();
      expect(
        screen.getByText(`organizer.responses.empty.${status} in ${other}`),
      ).toBeInTheDocument();
      cleanup();
    }
  });
});
