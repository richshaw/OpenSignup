import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestSignals } from './view-tracker';

const headersRead = vi.fn();
const pending: Array<() => unknown> = [];

vi.mock('next/headers', () => ({
  headers: async () => {
    headersRead();
    return new Headers({
      'user-agent': 'Mozilla/5.0 (iPhone) Mobile',
      referer: 'https://example.com/x',
    });
  },
}));
vi.mock('next/server', () => ({ after: (fn: () => unknown) => pending.push(fn) }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));

const { trackAfterResponse } = await import('./view-tracker');

describe('trackAfterResponse', () => {
  beforeEach(() => {
    headersRead.mockClear();
    pending.length = 0;
  });

  it('reads the signals during render and records only once the page is sent', async () => {
    const record = vi.fn(async (_args: { signupId: string; signals: RequestSignals }) => {});
    await trackAfterResponse(record, { signupId: 'sig_1' });

    expect(headersRead).toHaveBeenCalledTimes(1);
    expect(record).not.toHaveBeenCalled();
    expect(pending).toHaveLength(1);

    await Promise.all(pending.map((fn) => fn()));
    expect(headersRead).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      signupId: 'sig_1',
      signals: {
        userAgent: 'Mozilla/5.0 (iPhone) Mobile',
        referer: 'https://example.com/x',
        dnt: false,
      },
    });
  });
});
