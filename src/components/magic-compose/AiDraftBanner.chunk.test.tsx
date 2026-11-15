// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { messagesFor } from '@/i18n/translator';
import { writeAiDraftWarnings } from './ai-draft-warnings';
import { AiDraftBanner } from './AiDraftBanner';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/app/signups/sig_test',
  useSearchParams: () => new URLSearchParams('aiDraft=1'),
}));

// The warnings' code won't load, as when a deploy has replaced it since the
// page opened.
vi.mock('./AiDraftWarnings', () => {
  throw new Error('Loading chunk failed');
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe('<AiDraftBanner /> when its warnings’ code won’t load', () => {
  it('keeps the banner and the page, and leaves the warnings out', async () => {
    writeAiDraftWarnings('sig_test', [{ code: 'stray_values', count: 1 }]);
    render(
      <main>
        <AiDraftBanner
          signupId="sig_test"
          signupStatus="draft"
          text={{ title: 'Your draft', body: 'Edit it', dismiss: 'Dismiss' }}
          locale="en"
          warningMessages={messagesFor('en', 'organizer.aiDraft.warnings')}
        />
      </main>,
    );
    // Once the import has failed, and React has rendered what comes of it.
    await import('./AiDraftWarnings').catch(() => {});
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.getByText('Your draft')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
