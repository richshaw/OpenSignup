// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { type Audience, SHIPPED } from '@/i18n/config';
import EditLinkNotFound from './c/[id]/not-found';
import { GONE_PAGE } from './gone-message';
import SignupNotFound from './not-found';

// The instance's DEFAULT_LOCALE: none, unless a test sets one.
const instance = vi.hoisted(() => ({ defaultLocale: undefined as string | undefined }));
vi.mock('@/i18n/server', () => ({ instanceDefaultLocale: () => instance.defaultLocale }));

const shippedToday = [...SHIPPED.participant];

afterEach(() => {
  cleanup();
  (SHIPPED as Record<Audience, readonly string[]>).participant = shippedToday;
  instance.defaultLocale = undefined;
});

describe('participant not-found pages', () => {
  it.each([
    ['the signup page', SignupNotFound, GONE_PAGE.signup],
    ['an edit link', EditLinkNotFound, GONE_PAGE.editLink],
  ])('%s shows its own message', (_, Page, copy) => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.title);
    expect(screen.getByText(copy.body)).toBeInTheDocument();
  });

  // No live signup, so no language of its own to read.
  it('marks the signup page’s message with the instance’s language for participants', () => {
    render(<SignupNotFound />);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');

    cleanup();
    (SHIPPED as Record<Audience, readonly string[]>).participant = ['en', 'sv'];
    instance.defaultLocale = 'sv';
    render(<SignupNotFound />);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'sv');
  });
});
