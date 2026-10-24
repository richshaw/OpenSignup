// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useClipboardCopy } from './useClipboardCopy';

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useClipboardCopy', () => {
  it('says copied for a moment after a copy that worked', async () => {
    const { result } = renderHook(() => useClipboardCopy(2000));
    let worked = false;
    await act(async () => {
      worked = await result.current.copy('https://your-site.example/s/x');
    });
    expect(worked).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://your-site.example/s/x');
    expect(result.current.copied).toBe(true);
    act(() => vi.advanceTimersByTime(1999));
    expect(result.current.copied).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.copied).toBe(false);
  });

  it('starts the moment again on a second copy', async () => {
    const { result } = renderHook(() => useClipboardCopy(2000));
    await act(() => result.current.copy('a'));
    act(() => vi.advanceTimersByTime(1500));
    await act(() => result.current.copy('b'));
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.copied).toBe(true);
  });

  it('resolves false and says nothing when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useClipboardCopy());
    let worked = true;
    await act(async () => {
      worked = await result.current.copy('a');
    });
    expect(worked).toBe(false);
    expect(result.current.copied).toBe(false);
  });
});
