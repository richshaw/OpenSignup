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

  it('words a refusal by its reason, when it has one the tab words itself', () => {
    render(
      <SaveStatus
        status={{
          kind: 'error',
          code: 'conflict',
          field: 'slotId',
          details: { reason: 'slot_has_signups', filled: 2, commitments: 1 },
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 people have signed up for this slot');
  });
});
