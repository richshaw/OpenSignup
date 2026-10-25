// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDelayedFlag } from './useDelayedFlag';

/** A flag shown after 300 ms of `on`, then for 400 ms at least. */
function flag() {
  const { result, rerender } = renderHook(
    ({ on }) => useDelayedFlag(on, { delay: 300, minVisible: 400 }),
    { initialProps: { on: false } },
  );
  return {
    shown: () => result.current,
    set: (on: boolean) => rerender({ on }),
    wait: (ms: number) => act(() => void vi.advanceTimersByTime(ms)),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useDelayedFlag', () => {
  it('never shows for an answer quicker than the delay', () => {
    const busy = flag();
    busy.set(true);
    busy.wait(299);
    busy.set(false);
    expect(busy.shown()).toBe(false);
    busy.wait(1_000);
    expect(busy.shown()).toBe(false);
  });

  it('shows once the answer has taken the delay', () => {
    const busy = flag();
    busy.set(true);
    busy.wait(299);
    expect(busy.shown()).toBe(false);
    busy.wait(1);
    expect(busy.shown()).toBe(true);
  });

  it('keeps showing for the minimum when the answer comes just after it showed', () => {
    const busy = flag();
    busy.set(true);
    busy.wait(350);
    busy.set(false);
    // Shown at 300, so kept until 700.
    busy.wait(349);
    expect(busy.shown()).toBe(true);
    busy.wait(1);
    expect(busy.shown()).toBe(false);
  });

  it('goes as the answer comes once it has shown for the minimum', () => {
    const busy = flag();
    busy.set(true);
    busy.wait(1_000);
    busy.set(false);
    busy.wait(0);
    expect(busy.shown()).toBe(false);
  });

  it('shows again, after the delay, for a press after it went', () => {
    const busy = flag();
    busy.set(true);
    busy.wait(350);
    busy.set(false);
    busy.wait(350);
    expect(busy.shown()).toBe(false);

    busy.set(true);
    busy.wait(299);
    expect(busy.shown()).toBe(false);
    busy.wait(1);
    expect(busy.shown()).toBe(true);
  });

  it('stays through a press made while it was still being kept', () => {
    const busy = flag();
    busy.set(true);
    busy.wait(350);
    busy.set(false);
    busy.wait(100);
    busy.set(true);
    busy.wait(1_000);
    expect(busy.shown()).toBe(true);
    busy.set(false);
    busy.wait(0);
    expect(busy.shown()).toBe(false);
  });
});
