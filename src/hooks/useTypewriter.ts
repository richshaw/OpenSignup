'use client';

import { useEffect, useState } from 'react';

/**
 * Reveals `full` one character at a time over `durationMs`. When `active`
 * is false, returns the full text immediately (used to keep prior values
 * visible after their reveal step completes).
 */
export function useTypewriter(full: string, active: boolean, durationMs = 1000): string {
  const [out, setOut] = useState('');

  useEffect(() => {
    if (!active) {
      setOut(full);
      return;
    }
    setOut('');
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / Math.max(1, durationMs));
      setOut(full.slice(0, Math.floor(full.length * p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [full, active, durationMs]);

  return out;
}
