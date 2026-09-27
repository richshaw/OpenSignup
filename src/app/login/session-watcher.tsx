'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const INTERVAL_MS = 3000;
const GIVE_UP_AFTER_MS = 15 * 60 * 1000;

/**
 * While a person waits for their email, ask whether a session has appeared
 * and move on the moment it has — so a link clicked in the same browser (or
 * a code typed here) never leaves this window stranded on "check your
 * email". Polls Auth.js's own session endpoint, which is a cheap cookie
 * lookup, and stops after fifteen minutes.
 */
export function SessionWatcher({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - started > GIVE_UP_AFTER_MS) return;
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' });
        const body = (await res.json().catch(() => null)) as { user?: unknown } | null;
        if (body?.user) {
          router.replace(callbackUrl);
          return;
        }
      } catch {
        // transient; try again next tick
      }
      timer = setTimeout(tick, INTERVAL_MS);
    };
    let timer = setTimeout(tick, INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [callbackUrl, router]);
  return null;
}
