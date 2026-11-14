// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrganizerStrip } from './organizer-strip';

// The real translator, or one that answers each key with where it was asked
// for ("organizer.publicPage.strip.edit in en"), so a test can see the strip's
// text comes from the catalog.
const translation = vi.hoisted(() => ({ standIn: false }));
vi.mock('@/i18n/server', async () => {
  const { getStandInTranslator, getTestServerTranslator } =
    await import('@/i18n/testing/translator');
  return {
    getServerTranslator: (locale: string, namespace: 'organizer.publicPage.strip') =>
      translation.standIn
        ? getStandInTranslator(locale, namespace)
        : getTestServerTranslator(locale, namespace),
  };
});

afterEach(() => {
  cleanup();
  translation.standIn = false;
});

describe('<OrganizerStrip />', () => {
  it('is an Organizer landmark with links to the signup’s Responses and Build tabs', () => {
    render(<OrganizerStrip signupId="sig_1" />);
    const nav = screen.getByRole('navigation', { name: 'Organizer' });
    expect(nav).toHaveTextContent('Your signup. Only organizers see this bar.');
    expect(screen.getByRole('link', { name: 'See responses' })).toHaveAttribute(
      'href',
      '/app/signups/sig_1/responses',
    );
    expect(screen.getByRole('link', { name: 'Edit signup' })).toHaveAttribute(
      'href',
      '/app/signups/sig_1/build',
    );
  });

  // The page under it is in the signup's language, so a screen reader would
  // read the strip in that language's voice without it.
  it('is marked English, the language of its text', () => {
    render(<OrganizerStrip signupId="sig_1" />);
    expect(screen.getByRole('navigation')).toHaveAttribute('lang', 'en');
  });

  it('takes its text from the organizer catalog, in English', () => {
    translation.standIn = true;
    render(<OrganizerStrip signupId="sig_1" />);
    const ask = (key: string) => `organizer.publicPage.strip.${key} in en`;
    const nav = screen.getByRole('navigation', { name: ask('label') });
    expect(nav).toHaveTextContent(ask('note'));
    expect(screen.getByRole('link', { name: ask('responses') })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ask('edit') })).toBeInTheDocument();
  });
});
