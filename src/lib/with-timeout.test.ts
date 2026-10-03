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

describe('withTimeout onLateSettle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function controllable<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  async function timeOut(work: Promise<unknown>, onLateSettle: () => void) {
    const settled = expect(withTimeout(work, 1_000, 'too slow', { onLateSettle })).rejects.toThrow(
      'too slow',
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
  }

  it('hears that abandoned work succeeded', async () => {
    const work = controllable<string>();
    const onLateSettle = vi.fn();
    await timeOut(work.promise, onLateSettle);
    expect(onLateSettle).not.toHaveBeenCalled();

    work.resolve('sent');
    await vi.advanceTimersByTimeAsync(0);
    expect(onLateSettle).toHaveBeenCalledExactlyOnceWith({ status: 'fulfilled', value: 'sent' });
  });

  it('hears the real error when abandoned work fails', async () => {
    const work = controllable<string>();
    const onLateSettle = vi.fn();
    await timeOut(work.promise, onLateSettle);

    const error = new Error('535 Authentication failed');
    work.reject(error);
    await vi.advanceTimersByTimeAsync(0);
    expect(onLateSettle).toHaveBeenCalledExactlyOnceWith({ status: 'rejected', reason: error });
  });

  it('is not called for work that settles in time', async () => {
    const onLateSettle = vi.fn();
    await withTimeout(Promise.resolve('sent'), 1_000, 'too slow', { onLateSettle });
    await expect(
      withTimeout(Promise.reject(new Error('550 rejected')), 1_000, 'too slow', { onLateSettle }),
    ).rejects.toThrow('550 rejected');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onLateSettle).not.toHaveBeenCalled();
  });
});
