'use client';

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

const FADE_MS = 900;

/**
 * Returns `true` for FADE_MS after the most recent `scroll` event on the
 * referenced element, then `false`. Used to drive an auto-hiding scrollbar
 * (visible while actively scrolling, fades after idle).
 */
export function useScrollbarFade<T extends HTMLElement>(ref: RefObject<T | null>): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ping = () => {
      setActive(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setActive(false), FADE_MS);
    };
    el.addEventListener('scroll', ping, { passive: true });
    return () => {
      el.removeEventListener('scroll', ping);
      if (timer) clearTimeout(timer);
    };
  }, [ref]);

  return active;
}
