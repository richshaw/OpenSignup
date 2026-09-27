// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GONE_PAGE } from './gone-message';
import SignupNotFound from './not-found';

describe('<SignupNotFound />', () => {
  it('says the signup is no longer available and points to the organizer', () => {
    render(<SignupNotFound />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(GONE_PAGE.title);
    expect(screen.getByText(GONE_PAGE.body)).toBeInTheDocument();
  });
});
