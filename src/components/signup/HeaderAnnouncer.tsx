'use client';

import { useEffect, useRef, useState } from 'react';
import type { SignupStatus } from '@/schemas/signups';

/**
 * The header's live region, one for the computer and phone headers both,
 * saying what a change made from this page did. Closing a signup takes away
 * the ⋯ that held Close signup, and the focus with it, so focus goes to the
 * signup's title rather than to the page.
 */
export function HeaderAnnouncer({ status }: { status: SignupStatus }) {
  const [message, setMessage] = useState('');
  const previous = useRef(status);

  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (was !== 'open' || status !== 'closed') return;
    setMessage('Closed. People can’t sign up now.');
    // A tick later, once a phone's sheet has finished closing: until then its
    // focus trap would take focus back. Both headers' titles are in the page,
    // one hidden, so it's the one on screen.
    const timer = setTimeout(() => {
      const titles = Array.from(document.querySelectorAll<HTMLElement>('[data-signup-title]'));
      titles.find((title) => title.getClientRects().length > 0)?.focus();
    });
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <p role="status" className="sr-only">
      {message}
    </p>
  );
}
