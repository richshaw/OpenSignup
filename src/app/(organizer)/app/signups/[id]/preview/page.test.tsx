import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OTHER_LANGUAGE, OTHER_LOCALE, TEST_LOCALES } from '@/i18n/testing/locales';
import { ship } from '@/i18n/testing/ship';
import { ServiceException, serviceError } from '@/lib/errors';
import { ok } from '@/lib/result';

const getSignupForOrganizer = vi.fn();
const committedBySlot = vi.fn();
/** The language stored on the signed-in organizer's account. */
const organizer = vi.hoisted(() => ({ locale: null as string | null }));

vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/auth/session', () => ({
  getOrganizerSession: async () => ({
    organizerId: 'org_1',
    email: 'pat@example.com',
    locale: organizer.locale,
  }),
  requireOrganizerSession: async () => ({
    organizerId: 'org_1',
    email: 'pat@example.com',
    locale: organizer.locale,
  }),
  toActor: () => ({ kind: 'organizer', organizerId: 'org_1' }),
}));
vi.mock('@/auth/sign-out', () => ({ signOutOrganizer: vi.fn(), switchOrganizer: vi.fn() }));
vi.mock('@/services/signups', () => ({
  getSignupForOrganizer: (...args: unknown[]) => getSignupForOrganizer(...args),
  getPublicSignup: vi.fn(),
}));
vi.mock('@/services/commitments', () => ({
  committedBySlot: (...args: unknown[]) => committedBySlot(...args),
}));
vi.mock('@/lib/view-tracker', () => ({ trackOrganizerView: vi.fn() }));
// Unit tests have no server environment; the instance sets no language.
// English from the catalog; any other language answers with the key it was
// asked for (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => undefined,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

const { default: SignupPreviewPage, generateMetadata } = await import('./page');

const signup = {
  id: 'sig_1',
  workspaceId: 'ws_1',
  slug: 'snack-duty',
  title: 'Snack duty — Spring season',
  description: '',
  status: 'open',
  settings: {},
  closesAt: null,
  fields: [],
  slots: [
    { id: 'slot_a', ref: 'a', values: {}, capacity: 2, status: 'open', slotAt: null },
    { id: 'slot_b', ref: 'b', values: {}, capacity: 1, status: 'open', slotAt: null },
  ],
};

type ViewProps = {
  slots: { id: string; committed: number }[];
  locale: string;
  organizerLocale: string;
};

type PreviewPage = ReactElement<{ lang?: string; children: ReactElement<ViewProps> }>;

describe('organizer preview page', () => {
  beforeEach(() => {
    organizer.locale = null;
    getSignupForOrganizer.mockReset();
    getSignupForOrganizer.mockResolvedValue(ok(signup));
    committedBySlot.mockReset();
    committedBySlot.mockResolvedValue({ slot_a: 1, slot_b: 1 });
  });

  it('asks for the sign-up counts and shows them, as the public page does', async () => {
    const page = (await SignupPreviewPage({
      params: Promise.resolve({ id: 'sig_1' }),
    })) as ReactElement<{ children: ReactElement<ViewProps> }>;

    expect(committedBySlot).toHaveBeenCalledWith({}, 'sig_1');
    const committed = page.props.children.props.slots.map((s) => [s.id, s.committed]);
    expect(committed).toEqual([
      ['slot_a', 1],
      ['slot_b', 1],
    ]);
  });

  // What participants will see, in the language they'll see it in, inside an
  // organizer page that's in the organizer's.
  it(`wraps the participant view in a ${OTHER_LANGUAGE} signup’s language, and gives its dates that language`, async () => {
    ship('participant', ['en', OTHER_LOCALE]);
    getSignupForOrganizer.mockResolvedValue(ok({ ...signup, settings: { locale: OTHER_LOCALE } }));
    const page = (await SignupPreviewPage({
      params: Promise.resolve({ id: 'sig_1' }),
    })) as PreviewPage;

    expect(page.props.lang).toBe(OTHER_LOCALE);
    expect(page.props.children.props.locale).toBe(OTHER_LOCALE);
  });

  it('marks an English signup’s preview English, as its page is', async () => {
    const page = (await SignupPreviewPage({
      params: Promise.resolve({ id: 'sig_1' }),
    })) as PreviewPage;

    expect(page.props.lang).toBe('en');
    expect(page.props.children.props.locale).toBe('en');
  });

  // The Preview banner over the view is the organizer's, whatever the signup's.
  it.each(TEST_LOCALES)(
    'gives the Preview banner the organizer’s language, %s, over an English signup',
    async (other) => {
      ship('organizer', ['en', other]);
      organizer.locale = other;
      const page = (await SignupPreviewPage({
        params: Promise.resolve({ id: 'sig_1' }),
      })) as PreviewPage;

      expect(page.props.lang).toBe('en');
      expect(page.props.children.props.organizerLocale).toBe(other);
    },
  );

  it('gives the Preview banner English for an organizer with no language stored', async () => {
    const page = (await SignupPreviewPage({
      params: Promise.resolve({ id: 'sig_1' }),
    })) as PreviewPage;
    expect(page.props.children.props.organizerLocale).toBe('en');
  });

  it('shows the not-found card for a signup in a workspace the organizer is not in', async () => {
    getSignupForOrganizer.mockRejectedValue(
      new ServiceException(serviceError('forbidden', 'not a member of that workspace')),
    );
    const page = (await SignupPreviewPage({
      params: Promise.resolve({ id: 'sig_theirs' }),
    })) as ReactElement<{ error: { code: string }; email: string; locale: string }>;

    expect(page.props.error.code).toBe('not_found');
    expect(page.props.email).toBe('pat@example.com');
    expect(page.props.locale).toBe('en');
    expect(committedBySlot).not.toHaveBeenCalled();
  });

  it('titles the tab "Signup not found" when the signup cannot be loaded', async () => {
    getSignupForOrganizer.mockRejectedValue(
      new ServiceException(serviceError('forbidden', 'not a member of that workspace')),
    );
    const params = Promise.resolve({ id: 'sig_theirs' });
    expect(await generateMetadata({ params })).toEqual({ title: 'Signup not found' });
  });

  it('titles the tab "Preview" for the organizer\'s own signup', async () => {
    const params = Promise.resolve({ id: 'sig_1' });
    expect(await generateMetadata({ params })).toEqual({ title: 'Preview' });
  });

  it.each(TEST_LOCALES)(
    'titles the tab, and words the not-found card, in the organizer’s language, %s',
    async (other) => {
      ship('organizer', ['en', other]);
      organizer.locale = other;
      const params = Promise.resolve({ id: 'sig_1' });
      expect(await generateMetadata({ params })).toEqual({
        title: `organizer.preview.title in ${other}`,
      });

      getSignupForOrganizer.mockRejectedValue(
        new ServiceException(serviceError('forbidden', 'not a member of that workspace')),
      );
      const theirs = Promise.resolve({ id: 'sig_theirs' });
      expect(await generateMetadata({ params: theirs })).toEqual({
        title: `organizer.loadError.tabTitle in ${other}`,
      });
      const page = (await SignupPreviewPage({ params: theirs })) as ReactElement<{
        locale: string;
      }>;
      expect(page.props.locale).toBe(other);
    },
  );
});
