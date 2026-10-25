'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Whether the window matches a media query, kept current as it changes; null
 * on the server and while hydrating, so a caller can wait to know before it
 * picks between layouts (a popover or a sheet, say) rather than guess and
 * swap.
 */
export function useMediaQuery(query: string): boolean | null {
  // One list for the query, asked on every render; none on the server, or
  // where there is no matchMedia to make one.
  const list = useMemo(
    () => (typeof window === 'undefined' || !window.matchMedia ? null : window.matchMedia(query)),
    [query],
  );
  const subscribe = useCallback(
    (onChange: () => void) => {
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    [list],
  );
  return useSyncExternalStore(
    subscribe,
    () => list?.matches ?? null,
    () => null,
  );
}
