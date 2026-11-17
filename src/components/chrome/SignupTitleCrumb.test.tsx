// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CATALOG_LOCALES } from '@/i18n/config';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { err, ok } from '@/lib/result';
import { serviceError } from '@/lib/errors';

type Session = { organizerId: string; email: string; locale: string | null };
type Signup = { title: string; settings: { locale?: string } };

// Who is signed in, and the signup the crumb names.
const request = vi.hoisted(() => ({
  session: { organizerId: 'org_1', email: 'pat@example.com', locale: null } as Session | null,
  signup: { title: 'Bake Sale', settings: {} } as Signup | null,
}));
vi.mock('@/auth/session', () => ({
  getOrganizerSession: async () => request.session,
  toActor: () => ({ kind: 'organizer', id: 'org_1' }),
}));
vi.mock('@/services/signups.cached', () => ({
  loadSignupForOrganizer: async () =>
    request.signup ? ok(request.signup) : err(serviceError('not_found', 'signup not found')),
}));
vi.mock('@/i18n/server', () => ({ instanceDefaultLocale: () => undefined }));

const { SignupTitleCrumb } = await import('./SignupTitleCrumb');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

afterEach(() => {
  cleanup();
  request.session = { organizerId: 'org_1', email: 'pat@example.com', locale: null };
  request.signup = { title: 'Bake Sale', settings: {} };
});

async function renderCrumb() {
  const crumb = await SignupTitleCrumb({ params: Promise.resolve({ id: 'sig_1' }) });
  render(<nav>{crumb}</nav>);
}

describe('SignupTitleCrumb', () => {
  it('names the signup as the current page, unmarked in the organizer’s language', async () => {
    await renderCrumb();
    const crumb = screen.getByText('Bake Sale');
    expect(crumb).toHaveAttribute('aria-current', 'page');
    expect(crumb).not.toHaveAttribute('lang');
  });

  it('shows nothing signed out, or for a signup it can’t load', async () => {
    request.signup = null;
    await renderCrumb();
    expect(screen.queryByText('Bake Sale')).toBeNull();
    request.session = null;
    await renderCrumb();
    expect(screen.queryByText('Bake Sale')).toBeNull();
  });

  it.each(OTHER_LANGUAGES)('marks the title of a signup in %s', async (other) => {
    ship('participant', ['en', other]);
    request.signup = { title: 'Bake Sale', settings: { locale: other } };
    await renderCrumb();
    expect(screen.getByText('Bake Sale')).toHaveAttribute('lang', other);
  });

  it.each(OTHER_LANGUAGES)(
    'leaves a signup stored in %s unmarked until it ships',
    async (other) => {
      shipOnlyEnglish();
      request.signup = { title: 'Bake Sale', settings: { locale: other } };
      await renderCrumb();
      expect(screen.getByText('Bake Sale')).not.toHaveAttribute('lang');
    },
  );

  it.each(OTHER_LANGUAGES)(
    'marks an English title in crumbs in %s, and not one in that language',
    async (other) => {
      ship('organizer', ['en', other]);
      ship('participant', ['en', other]);
      request.session = { organizerId: 'org_1', email: 'pat@example.com', locale: other };
      await renderCrumb();
      expect(screen.getByText('Bake Sale')).toHaveAttribute('lang', 'en');
      cleanup();
      request.signup = { title: 'Bake Sale', settings: { locale: other } };
      await renderCrumb();
      expect(screen.getByText('Bake Sale')).not.toHaveAttribute('lang');
    },
  );
});
