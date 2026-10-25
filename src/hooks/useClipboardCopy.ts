'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copies text to the clipboard and says so for a moment: `copied` is true for
 * `resetMs` after a copy that worked. `copy` resolves to whether it worked.
 * The clipboard can refuse (plain HTTP, a denied permission); that resolves
 * to false and shows nothing.
 */
export function useClipboardCopy(resetMs = 2000): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return false;
      }
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), resetMs);
      return true;
    },
    [resetMs],
  );

  return { copied, copy };
}
