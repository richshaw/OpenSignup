'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { Spinner } from '@/components/ui/spinner';

/**
 * The confirm page's **Sign in →** button. It stays a plain link, because
 * sign-in depends on the cookie the callback's 302 sets, which only a
 * top-level navigation keeps. The callback can take a few seconds, and a
 * second click would reuse the single-use token and land on "That sign-in
 * link is no longer valid", so after the first click the button says
 * "Signing in…" and ignores further clicks. A click that opens a new tab or
 * window is left alone. Coming back to the page with the Back button resets
 * it, since that page may be restored from the back-forward cache as it was.
 */
export function SignInLink({ href }: { href: string }) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (pending) {
      event.preventDefault();
      return;
    }
    setPending(true);
  };

  return (
    <a
      href={href}
      referrerPolicy="no-referrer"
      onClick={onClick}
      aria-disabled={pending || undefined}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f6feb] px-5 py-3 text-center font-medium text-white no-underline transition-colors hover:bg-[#1658c4] aria-disabled:cursor-default aria-disabled:opacity-80 aria-disabled:hover:bg-[#1f6feb]"
    >
      {pending ? (
        <>
          <Spinner />
          <span>Signing in…</span>
        </>
      ) : (
        'Sign in →'
      )}
    </a>
  );
}
