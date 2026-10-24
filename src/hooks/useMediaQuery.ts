'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether the window matches a media query, kept current as it changes; null
 * on the server and while hydrating, so a caller can wait to know before it
 * picks between layouts (a popover or a sheet, say) rather than guess and
 * swap.
 */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  );
}
