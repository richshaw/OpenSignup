'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * While `open`, calls `onClose` on a mousedown outside every element in `refs`
 * (a picker's trigger and its menu).
 */
export function useOutsideClose(
  open: boolean,
  refs: RefObject<HTMLElement | null>[],
  onClose: () => void,
) {
  const latest = useRef({ refs, onClose });
  useEffect(() => {
    latest.current = { refs, onClose };
  });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const outside = latest.current.refs.every(
        (ref) => ref.current && !ref.current.contains(target),
      );
      if (outside) latest.current.onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);
}
