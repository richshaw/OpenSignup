'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * While `open`, calls `onClose` on a mousedown outside every element in `refs`
 * (a picker's trigger and its menu). With `focus`, also when focus moves to an
 * element outside them all, as Tab past the last button does. Focus that goes
 * nowhere (a button inside going disabled, the window losing focus) doesn't
 * count.
 */
export function useOutsideClose(
  open: boolean,
  refs: RefObject<HTMLElement | null>[],
  onClose: () => void,
  { focus = false }: { focus?: boolean } = {},
) {
  const latest = useRef({ refs, onClose });
  useEffect(() => {
    latest.current = { refs, onClose };
  });

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: Event) {
      const target = e.target as Node;
      const outside = latest.current.refs.every(
        (ref) => ref.current && !ref.current.contains(target),
      );
      if (outside) latest.current.onClose();
    }
    document.addEventListener('mousedown', handleOutside);
    if (focus) document.addEventListener('focusin', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('focusin', handleOutside);
    };
  }, [open, focus]);
}
