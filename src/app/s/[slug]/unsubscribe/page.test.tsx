// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { previewReminderOptOut } = vi.hoisted(() => ({ previewReminderOptOut: vi.fn() }));

vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/services/reminder-optout', () => ({ previewReminderOptOut }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import UnsubscribePage from './page';

const TARGET = {
  participantId: 'p1',
  participantEmail: 'ada@example.com',
  signupTitle: 'Sunday run',
  signupSlug: 'run',
  optedOut: true,
};

async function render(searchParams: Record<string, string>, target = TARGET) {
  previewReminderOptOut.mockResolvedValue({ ok: true, value: target });
  return renderToStaticMarkup(
    await UnsubscribePage({
      params: Promise.resolve({ slug: 'run' }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

/** The sentence both branches share when the previous POST failed. */
const FAILED = 'nothing has changed';

describe('unsubscribe page', () => {
  // #785: turning reminders back on and failing left the page looking exactly
  // as it did before the click — same heading, same button, no error.
  it('says a failed "turn reminders back on" did nothing', async () => {
    const html = await render({ p: 'p1', token: 't', error: '1' });

    expect(html).toContain(FAILED);
    expect(html).toContain('Turn reminders back on');
  });

  it('stays quiet when the participant simply arrived opted out', async () => {
    const html = await render({ p: 'p1', token: 't' });

    expect(html).not.toContain(FAILED);
    expect(html).toContain('Turn reminders back on');
  });

  it('still says a failed "stop reminders" did nothing', async () => {
    const html = await render({ p: 'p1', token: 't', error: '1' }, { ...TARGET, optedOut: false });

    expect(html).toContain(FAILED);
    expect(html).toContain('Stop reminders');
  });
});
