import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './with-timeout';

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes through a result that arrives in time', async () => {
    await expect(withTimeout(Promise.resolve('sent'), 1_000, 'too slow')).resolves.toBe('sent');
  });

  it('passes through an error that arrives in time', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('550 rejected')), 1_000, 'too slow'),
    ).rejects.toThrow('550 rejected');
  });

  it('rejects with its own message once the time is up', async () => {
    const result = withTimeout(new Promise(() => {}), 1_000, 'too slow');
    const settled = expect(result).rejects.toThrow('too slow');
    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
  });

  it('clears its timer when the work finishes first', async () => {
    await withTimeout(Promise.resolve('sent'), 1_000, 'too slow');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not surface a late failure of the abandoned work', async () => {
    let fail!: (e: Error) => void;
    const work = new Promise<never>((_, reject) => (fail = reject));
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    try {
      const settled = expect(withTimeout(work, 1_000, 'too slow')).rejects.toThrow('too slow');
      await vi.advanceTimersByTimeAsync(1_000);
      await settled;
      fail(new Error('Greeting never received'));
      vi.useRealTimers();
      await new Promise((r) => setImmediate(r));
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
