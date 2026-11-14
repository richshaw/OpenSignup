// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/lib/env', () => ({ getEnv: () => ({ AUTH_URL: 'http://localhost:3000' }) }));

const next =
  'http://localhost:3000/api/auth/callback/nodemailer?token=not-a-real-token&email=pat%40example.com';

describe('ConfirmLoginPage', () => {
  // Every emailed sign-in link lands here, and the page shows the person's
  // email address, so it carries the same footer as the login page.
  it('links to the privacy policy and terms in the site footer', async () => {
    const { default: ConfirmLoginPage } = await import('./page');
    render(await ConfirmLoginPage({ searchParams: Promise.resolve({ next }) }));

    expect(screen.getByText('pat@example.com')).toBeInTheDocument();
    const footer = within(screen.getByRole('navigation', { name: 'Footer' }));
    expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });
});
