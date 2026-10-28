// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrganizerStrip } from './organizer-strip';

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
});
