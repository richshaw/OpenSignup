'use client';

import { useEffect, useRef } from 'react';

/**
 * Calls `onLeave` as the page goes away: on `pagehide`, or when
 * `visibilitychange` turns the document hidden.
 *
 * A reload, a closed tab or leaving the site doesn't unmount React or blur a
 * field, so effect cleanups and blur handlers never run then (#598, #699).
 * `visibilitychange` covers a phone that drops a background tab without
 * `pagehide`. Not `unload` or `beforeunload`, which keep the page out of the
 * back-forward cache in some browsers; after a `pagehide` that keeps it
 * there, the page carries on as before.
 *
 * `capture` registers both listeners in the capture phase, so they run before
 * bubbling listeners on the same target, whatever order they were added in.
 */
export function usePageLeave(
  onLeave: () => void,
  { enabled = true, capture = false }: { enabled?: boolean; capture?: boolean } = {},
): void {
  // Assigned during render, not in an effect, so a `pagehide` landing between
  // a render and its effects still calls the latest callback.
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  useEffect(() => {
    if (!enabled) return;
    const onPageHide = () => onLeaveRef.current();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') onLeaveRef.current();
    };
    window.addEventListener('pagehide', onPageHide, { capture });
    document.addEventListener('visibilitychange', onVisibilityChange, { capture });
    return () => {
      window.removeEventListener('pagehide', onPageHide, { capture });
      document.removeEventListener('visibilitychange', onVisibilityChange, { capture });
    };
  }, [enabled, capture]);
}
