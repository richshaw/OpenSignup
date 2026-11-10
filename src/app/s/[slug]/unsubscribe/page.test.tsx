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

const ON_ERROR = "We couldn't turn your reminders back on. Please try again.";
const OFF_ERROR = "We couldn't turn off your reminders. Please try again.";

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

  it('shows the failure message when error=on after a failed opt-in', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok', error: 'on' }),
    });
    const { container } = render(page);
    expect(container.textContent).toContain(ON_ERROR);
  });

  it('does not show the failure message for a stale error=off on the opted-out page', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok', error: 'off' }),
    });
    const { container } = render(page);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('ignores legacy error=1 beside a successful opt-out', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok', done: 'off', error: '1' }),
    });
    const { container } = render(page);
    expect(container.textContent).toContain('Reminders turned off');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not show the failure message without error', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok' }),
    });
    const { container } = render(page);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('Reminders are off');
  });
});

const optedInTarget = {
  ...optedOutTarget,
  optedOut: false,
};

describe('unsubscribe page — opted in', () => {
  beforeEach(() => {
    previewReminderOptOut.mockReset();
    previewReminderOptOut.mockResolvedValue(ok(optedInTarget));
  });

  it('shows the failure message when error=off after a failed opt-out', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok', error: 'off' }),
    });
    const { container } = render(page);
    expect(container.textContent).toContain(OFF_ERROR);
  });

  it('does not show the failure message for a stale error=on on the confirm page', async () => {
    const page = await UnsubscribePage({
      params: Promise.resolve({ slug: 'bake-sale' }),
      searchParams: Promise.resolve({ p: 'par_1', token: 'tok', error: 'on' }),
    });
    const { container } = render(page);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
