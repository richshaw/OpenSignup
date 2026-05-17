// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  SignupViewBody,
  type SignupViewField,
  type SignupViewSlot,
} from './signup-view';

const FIELDS: SignupViewField[] = [
  { ref: 'date', label: 'Date', fieldType: 'date' },
  { ref: 'team', label: 'Team', fieldType: 'text' },
];

const SLOTS: SignupViewSlot[] = [
  {
    id: 's1',
    ref: 's1',
    values: { date: '2026-05-17', team: 'Hawks' },
    slotAt: null,
    capacity: 2,
    status: 'open',
    committed: 0,
  },
];

const SIGNUP = { title: 'Snack duty', description: null, status: 'open' as const };

describe('<SignupViewBody mode="showcase" />', () => {
  it('renders the row action as an inert span styled like the active button', () => {
    render(
      <SignupViewBody
        signup={SIGNUP}
        fields={FIELDS}
        groupByRef={null}
        slots={SLOTS}
        slug="example"
        mode="showcase"
      />,
    );

    const labels = screen.getAllByText('Sign up');
    expect(labels).toHaveLength(1);
    const pill = labels[0]!;
    expect(pill.tagName).toBe('SPAN');
    expect(pill).not.toHaveAttribute('aria-hidden');
    expect(pill).toHaveClass('bg-brand');
    expect(pill).not.toHaveClass('opacity-60');
    expect(pill).not.toHaveClass('cursor-not-allowed');
  });

  it('does not render the preview banner in showcase mode', () => {
    render(
      <SignupViewBody
        signup={SIGNUP}
        fields={FIELDS}
        groupByRef={null}
        slots={SLOTS}
        slug="example"
        mode="showcase"
      />,
    );
    expect(screen.queryByText('Preview')).toBeNull();
    expect(
      screen.queryByText(/This signup is live\. The page below shows what visitors see\./),
    ).toBeNull();
  });

  it('preview mode still renders a disabled Sign-up button (regression guard)', () => {
    render(
      <SignupViewBody
        signup={{ ...SIGNUP, status: 'draft' }}
        fields={FIELDS}
        groupByRef={null}
        slots={SLOTS}
        slug="example"
        mode="preview"
        showStateBanner={false}
      />,
    );
    const button = screen.getByRole('button', { name: 'Sign up' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('opacity-60');
  });
});
