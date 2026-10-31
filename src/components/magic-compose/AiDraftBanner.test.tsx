// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AiDraftBanner } from './AiDraftBanner';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/app/signups/sig_test',
  useSearchParams: () => new URLSearchParams('aiDraft=1'),
}));

afterEach(() => {
  cleanup();
});

function renderBanner(fieldsCount: number, slotsCount: number) {
  render(
    <AiDraftBanner
      signupId="sig_test"
      signupStatus="draft"
      fieldsCount={fieldsCount}
      slotsCount={slotsCount}
    />,
  );
}

describe('<AiDraftBanner />', () => {
  it('counts one field and one slot in the singular', () => {
    renderBanner(1, 1);
    expect(screen.getByText("Here's your draft, 1 field and 1 slot")).toBeInTheDocument();
  });

  it('counts several fields and slots as fields, never columns', () => {
    renderBanner(2, 3);
    expect(screen.getByText("Here's your draft, 2 fields and 3 slots")).toBeInTheDocument();
    expect(screen.queryByText(/column/i)).not.toBeInTheDocument();
  });
});
