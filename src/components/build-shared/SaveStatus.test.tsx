// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SaveStatus } from './SaveStatus';

describe('<SaveStatus />', () => {
  // A viewer never had edit access, so nothing says they lost it.
  it('tells a viewer whose save was refused that they have no edit access', () => {
    render(<SaveStatus status={{ kind: 'error', code: 'forbidden' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('You don’t have edit access.');
  });

  it('shows a message the save brought with it instead', () => {
    render(
      <SaveStatus status={{ kind: 'error', code: 'conflict', message: 'Reload to see latest.' }} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Reload to see latest.');
  });
});
