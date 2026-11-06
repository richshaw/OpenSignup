// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/lib/result';

const previewReminderOptOut = vi.fn();

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/services/reminder-optout', () => ({
  previewReminderOptOut: (...args: unknown[]) => previewReminderOptOut(...args),
}));

const { default: UnsubscribePage } = await import('./page');

const ERROR_COPY = "That didn't work — nothing has changed. Try again below.";

const optedOutTarget = {
  participantId: 'par_1',
  participantEmail: 'dana@example.test',
  signupTitle: 'Bake sale',
  signupSlug: 'bake-sale',
  optedOut: true,
};

describe('unsubscribe page — opted out', () => {
  beforeEach(() => {
    previewReminderOptOut.mockReset();
    previewReminderOptOut.mockResolvedValue(ok(optedOutTarget));
  });

  it('shows the failure message when error=1 after a failed opt-in', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok', error: '1' }),
    });
    const { container } = render(page);
    expect(container.textContent).toContain(ERROR_COPY);
  });

  it('does not show the failure message without error', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok' }),
    });
    const { container } = render(page);
    expect(container.textContent).not.toContain(ERROR_COPY);
    expect(container.textContent).toContain('Reminders are off');
  });
});
