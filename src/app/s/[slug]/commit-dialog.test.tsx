// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommitDialog from './commit-dialog';
import { ACTION_SIZING } from './slot-format';

// The row-level tests all run in `mode="preview"`, which renders a *disabled*
// stand-in button. This file covers the real trigger — the only button a
// participant ever taps, and the only thing commit-dialog.tsx contributes.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('<CommitDialog /> trigger', () => {
  function renderTrigger() {
    render(
      <CommitDialog
        slotId="slot_1"
        slotTitle="Cookies"
        actionName="Sat, May 16, Cookies, Vinland Elementary"
        slotAt={null}
        slotHasTime={false}
        signupTitle="Snack duty"
        slug="example"
      />,
    );
  }

  it('is named after its slot, so a list of them is distinguishable', () => {
    renderTrigger();
    expect(
      screen.getByRole('button', { name: 'Sign up for Sat, May 16, Cookies, Vinland Elementary' }),
    ).toBeInTheDocument();
  });

  it('carries the shared action geometry, including the 44px touch floor', () => {
    renderTrigger();
    const button = screen.getByRole('button', { name: /^Sign up for / });
    for (const cls of ACTION_SIZING.split(' ')) {
      expect(button).toHaveClass(cls);
    }
  });
});
