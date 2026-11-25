// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { serviceError } from '@/lib/errors';
import { err, ok } from '@/lib/result';
import { INSTANCE_NAME } from '@/lib/site-config';
import { getTranslator } from '@/i18n/translator';
import { findDraftForOrganizer } from '@/services/signups';
import { getOrganizerSession } from '@/auth/session';
import { recordPublicView, trackAfterResponse } from '@/lib/view-tracker';
import { NEW_TAB_NOTE_ID } from '../new-tab';

// The signup at the slug as stored, or null for none; whether the instance
// serves embeds; and who is looking (a visitor unless a test signs in the
// signup's own organizer).
const request = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  embedsEnabled: true,
  organizerSignedIn: false,
}));

vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  embedsEnabled: () => request.embedsEnabled,
}));

// English from the catalog, and no DEFAULT_LOCALE.
vi.mock('@/i18n/server', async () => {
  const { getTranslator } = await import('@/i18n/translator');
  return {
    instanceDefaultLocale: () => undefined,
    getServerTranslator: (locale: 'en', namespace: 'participant.signupPage') =>
      getTranslator(locale, namespace, {
        onError: (error) => {
          throw error;
        },
      }),
  };
});

const FIELDS = [{ id: 'fld_1', ref: 'what', label: 'What', fieldType: 'text', sortOrder: 0 }];
const SLOTS = [
  { id: 'slot_1', ref: 'slot_1', values: { what: 'Fruit' }, slotAt: null, capacity: 2 },
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

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  permanentRedirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
const ORGANIZER = {
  kind: 'organizer',
  id: 'org_1',
  email: 'pat@example.com',
  workspaceIds: ['ws_1'],
  workspaceRoles: { ws_1: 'owner' },
};
vi.mock('@/auth/session', () => ({
  getOrganizerSession: vi.fn(async () => (request.organizerSignedIn ? { locale: null } : null)),
  toActor: () => (request.organizerSignedIn ? ORGANIZER : { kind: 'anonymous' }),
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/services/commitments', () => ({ getOwnCommitmentsForSignup: async () => [] }));
vi.mock('@/services/signups', () => ({
  findDraftForOrganizer: vi.fn(async () => ok({ id: 'sig_1' })),
}));
vi.mock('@/lib/view-tracker', () => ({
  recordPublicView: vi.fn(),
  trackAfterResponse: vi.fn(async () => {}),
}));

const { default: EmbeddedSignupPage, generateMetadata } = await import('./page');

const params = { params: Promise.resolve({ slug: 'snack-duty' }) };
const throwOnError = {
  onError: (error: unknown) => {
    throw error;
  },
};
const t = getTranslator('en', 'participant.signupPage', throwOnError);

function storeSignup(over: Record<string, unknown> = {}) {
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

afterEach(() => {
  cleanup();
  request.row = null;
  request.embedsEnabled = true;
  request.organizerSignedIn = false;
  vi.clearAllMocks();
});

describe('a signup’s embed, shown inside another website', () => {
  it('shows the signup’s sheet, with its home link opening a new tab', async () => {
    storeSignup();
    render(await EmbeddedSignupPage(params));
    expect(screen.getByRole('heading', { level: 1, name: 'Snack duty' })).toBeInTheDocument();
    const home = screen.getByRole('link', { name: INSTANCE_NAME });
    expect(home).toHaveAttribute('target', '_blank');
    expect(home).toHaveAttribute('rel', 'noopener');
    expect(home).toHaveAccessibleDescription('Opens in a new tab');
    expect(document.getElementById(NEW_TAB_NOTE_ID)).not.toBeNull();
  });

  it('never shows the organizer strip, nor reads the session for it', async () => {
    storeSignup();
    request.organizerSignedIn = true;
    const page = await EmbeddedSignupPage(params);
    expect((page as { props: { children: unknown[] } }).props.children[0]).toBeNull();
    expect(getOrganizerSession).not.toHaveBeenCalled();
  });

  it('doesn’t count the view', async () => {
    storeSignup();
    await EmbeddedSignupPage(params);
    expect(trackAfterResponse).not.toHaveBeenCalled();
    expect(recordPublicView).not.toHaveBeenCalled();
  });

  it('shows a draft’s visitor message, even to its own organizer', async () => {
    storeSignup({ status: 'draft' });
    request.organizerSignedIn = true;
    render(await EmbeddedSignupPage(params));
    expect(screen.getByText(t('draft.title'))).toBeInTheDocument();
    expect(screen.getByText(t('draft.body'))).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(findDraftForOrganizer).not.toHaveBeenCalled();
  });

  it('shows an archived signup’s message', async () => {
    storeSignup({ status: 'archived' });
    render(await EmbeddedSignupPage(params));
    expect(screen.getByText(t('archived.title'))).toBeInTheDocument();
  });

  it('shows a closed signup with its Closed banner', async () => {
    storeSignup({ status: 'closed' });
    render(await EmbeddedSignupPage(params));
    expect(screen.getByRole('heading', { level: 1, name: 'Snack duty' })).toBeInTheDocument();
    const closed = getTranslator(
      'en',
      'participant.signupView',
      throwOnError,
    )('closedBanner.title');
    expect(screen.getAllByText(closed)[0]).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign up/i })).toBeNull();
  });

  it('is not found for an unknown slug', async () => {
    await expect(EmbeddedSignupPage(params)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('is not found when the instance turns embeds off', async () => {
    storeSignup();
    request.embedsEnabled = false;
    await expect(EmbeddedSignupPage(params)).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(generateMetadata(params)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('sends a slug with punctuation after it to that slug’s embed', async () => {
    storeSignup();
    await expect(
      EmbeddedSignupPage({ params: Promise.resolve({ slug: 'snack-duty.' }) }),
    ).rejects.toThrow('NEXT_REDIRECT /s/snack-duty/embed');
  });

  it('keeps out of search, as the signup’s own page does', async () => {
    storeSignup();
    expect((await generateMetadata(params)).robots).toEqual({ index: false, follow: false });
  });
});
