// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import EditLinkNotFound from './c/[id]/not-found';
import { GONE_PAGE } from './gone-message';
import SignupNotFound from './not-found';

describe('participant not-found pages', () => {
  it.each([
    ['the signup page', SignupNotFound, GONE_PAGE.signup],
    ['an edit link', EditLinkNotFound, GONE_PAGE.editLink],
  ])('%s shows its own message', (_, Page, copy) => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.title);
    expect(screen.getByText(copy.body)).toBeInTheDocument();
  });
});
