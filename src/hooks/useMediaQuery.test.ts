// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { useMediaQuery } from './useMediaQuery';

/** A window `width` px wide that answers `(min-width: Npx)` queries; jsdom has no matchMedia. */
function giveWindow(width: number) {
  const listeners = new Set<() => void>();
  let current = width;
  window.matchMedia = (query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      get matches() {
        return current >= min;
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    } as unknown as MediaQueryList;
  };
  return {
    resize(to: number) {
      current = to;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('useMediaQuery', () => {
  it('says whether the window matches', () => {
    giveWindow(1280);
    expect(renderHook(() => useMediaQuery('(min-width: 768px)')).result.current).toBe(true);
    giveWindow(390);
    expect(renderHook(() => useMediaQuery('(min-width: 768px)')).result.current).toBe(false);
  });

  it('follows the window as it changes, and stops listening once unmounted', () => {
    const win = giveWindow(1280);
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    act(() => win.resize(390));
    expect(result.current).toBe(false);
    unmount();
    expect(win.listeners.size).toBe(0);
  });

  it('is null on the server, where there is no window to ask', () => {
    function Probe() {
      return String(useMediaQuery('(min-width: 768px)'));
    }
    expect(renderToString(createElement(Probe))).toBe('null');
  });
});
