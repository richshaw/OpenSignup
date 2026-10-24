'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * `on`, for showing that something is busy without a flash: true only once
 * `on` has lasted `delay` ms, and then for `minVisible` ms at least, however
 * soon `on` ends. So an answer quicker than `delay` never shows at all, and
 * one just slower doesn't flicker.
 */
export function useDelayedFlag(
  on: boolean,
  { delay, minVisible }: { delay: number; minVisible: number },
): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (on === shown) return;
    const timer = setTimeout(
      () => {
        shownAt.current = Date.now();
        setShown(on);
      },
      // Below 0 once the minimum is up: then it goes at once.
      on ? delay : shownAt.current + minVisible - Date.now(),
    );
    return () => clearTimeout(timer);
  }, [on, shown, delay, minVisible]);
  return shown;
}
