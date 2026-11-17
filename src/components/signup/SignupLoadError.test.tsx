// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CATALOG_LOCALES } from '@/i18n/config';
import { serviceError } from '@/lib/errors';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/auth/sign-out', () => ({ signOutOrganizer: vi.fn(), switchOrganizer: vi.fn() }));
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => ({
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

const { SignupLoadError, signupNotFoundTitle } = await import('./SignupLoadError');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

afterEach(cleanup);

describe('SignupLoadError', () => {
  it('says the signup can’t be found, names the account and offers to switch', () => {
    render(
      <SignupLoadError
        error={serviceError('not_found', 'signup not found')}
        email="pat@example.com"
        locale="en"
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'We can’t find this signup',
    );
    expect(screen.getByText(/It may have been deleted/)).toHaveTextContent(
      'It may have been deleted, or it may belong to a different account. You’re signed in as pat@example.com.',
    );
    expect(screen.getByText('pat@example.com')).toHaveClass('break-all');
    expect(screen.getByRole('link', { name: 'Go to your signups' })).toHaveAttribute(
      'href',
      '/app',
    );
    expect(
      screen.getByRole('button', { name: 'Sign in with a different email' }),
    ).toBeInTheDocument();
    // The server's API wording never reaches the page.
    expect(screen.queryByText('signup not found')).not.toBeInTheDocument();
  });

  it('shows a generic failure, without the account switch, for any other error', () => {
    render(
      <SignupLoadError
        error={serviceError('internal', 'boom')}
        email="pat@example.com"
        locale="en"
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'We couldn’t open this signup',
    );
    expect(
      screen.getByText('Something went wrong on our side. Reload the page to try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pat@example.com/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in with a different email' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it.each(OTHER_LANGUAGES)('takes its text from the organizer catalog in %s', (locale) => {
    render(
      <SignupLoadError
        error={serviceError('not_found', 'signup not found')}
        email="pat@example.com"
        locale={locale}
      />,
    );
    const ask = (key: string) => `organizer.loadError.${key} in ${locale}`;
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ask('notFound.title'));
    expect(screen.getByText(ask('notFound.body'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ask('goToSignups') })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('button', { name: ask('switchAccount') })).toBeInTheDocument();
  });
});

describe('signupNotFoundTitle', () => {
  it('titles the tab as before in English, and from the catalog in another language', () => {
    expect(signupNotFoundTitle('en')).toBe('Signup not found');
    for (const locale of OTHER_LANGUAGES) {
      expect(signupNotFoundTitle(locale)).toBe(`organizer.loadError.tabTitle in ${locale}`);
    }
  });
});
