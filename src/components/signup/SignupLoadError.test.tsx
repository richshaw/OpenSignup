// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { serviceError } from '@/lib/errors';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/auth/sign-out', () => ({ signOutOrganizer: vi.fn() }));

const { SIGNUP_LOAD_ERROR, SignupLoadError } = await import('./SignupLoadError');

describe('SignupLoadError', () => {
  it('says the signup can’t be found, names the account and offers to switch', () => {
    render(
      <SignupLoadError
        error={serviceError('not_found', 'signup not found')}
        email="pat@example.com"
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      SIGNUP_LOAD_ERROR.notFound.title,
    );
    expect(screen.getByText(/It may have been deleted/)).toHaveTextContent(
      `${SIGNUP_LOAD_ERROR.notFound.body} You’re signed in as pat@example.com.`,
    );
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
    render(<SignupLoadError error={serviceError('internal', 'boom')} email="pat@example.com" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      SIGNUP_LOAD_ERROR.failed.title,
    );
    expect(screen.getByText(SIGNUP_LOAD_ERROR.failed.body)).toBeInTheDocument();
    expect(screen.queryByText(/pat@example.com/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in with a different email' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});
