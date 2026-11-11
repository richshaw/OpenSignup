// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageLeave } from './usePageLeave';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

afterEach(() => {
  setVisibility('visible');
});

describe('usePageLeave', () => {
  it('calls back on pagehide and when the document turns hidden', () => {
    const onLeave = vi.fn();
    renderHook(() => usePageLeave(onLeave));
    window.dispatchEvent(new Event('pagehide'));
    expect(onLeave).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it('ignores visibilitychange while the document is still visible', () => {
    const onLeave = vi.fn();
    renderHook(() => usePageLeave(onLeave));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('listens for nothing while disabled, and starts once enabled', () => {
    const onLeave = vi.fn();
    const { rerender } = renderHook(({ enabled }) => usePageLeave(onLeave, { enabled }), {
      initialProps: { enabled: false },
    });
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onLeave).not.toHaveBeenCalled();
    rerender({ enabled: true });
    window.dispatchEvent(new Event('pagehide'));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('calls the latest callback without re-subscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const add = vi.spyOn(window, 'addEventListener');
    const { rerender } = renderHook(({ cb }) => usePageLeave(cb), { initialProps: { cb: first } });
    rerender({ cb: second });
    window.dispatchEvent(new Event('pagehide'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(add.mock.calls.filter(([type]) => type === 'pagehide')).toHaveLength(1);
    add.mockRestore();
  });

  it('runs a capture listener before a bubbling one added earlier', () => {
    const order: string[] = [];
    renderHook(() => usePageLeave(() => order.push('bubble')));
    renderHook(() => usePageLeave(() => order.push('capture'), { capture: true }));
    window.dispatchEvent(new Event('pagehide'));
    expect(order).toEqual(['capture', 'bubble']);
  });

  it('stops listening on unmount', () => {
    const onLeave = vi.fn();
    const { unmount } = renderHook(() => usePageLeave(onLeave));
    unmount();
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onLeave).not.toHaveBeenCalled();
  });
});
