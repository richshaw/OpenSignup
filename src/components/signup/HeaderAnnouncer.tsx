'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { SignupStatus } from '@/schemas/signups';
import type { StatusAction } from './StatusActionForm';

// Set when this page's Close signup has closed the signup, and read when the
// header next sees its status change.
const ClosedHere = createContext<RefObject<boolean> | null>(null);

/**
 * `closeAction`, telling the header when it has closed the signup, so the
 * header says so and moves focus. A signup closed some other way (another
 * tab, an AI assistant) shows as closed when the page next reloads its data,
 * without either.
 */
export function useAnnouncedClose(closeAction: StatusAction): StatusAction {
  const closedHere = useContext(ClosedHere);
  return async () => {
    const refusal = await closeAction();
    if (!refusal && closedHere) closedHere.current = true;
    return refusal;
  };
}

const Say = createContext<(message: string) => void>(() => {});

/**
 * Has the header's live region say `message`: the share panel's "Published."
 * when Publish on this page answers that it published (focus is the panel's,
 * which opens at the same moment; a signup published some other way says
 * nothing), and Publish and share's "Publish and share when you’re ready."
 * when it takes the focus back after a check's fix. The same words said
 * again are read again.
 */
export function useAnnounce(): (message: string) => void {
  return useContext(Say);
}

/**
 * Holds the computer and phone headers, with one live region for both that
 * says what a change made from this page did. Closing a signup takes away
 * the ⋯ that held Close signup, and the focus with it, so focus goes to the
 * signup's title rather than to the page.
 */
export function HeaderAnnouncer({
  status,
  children,
}: {
  status: SignupStatus;
  children: ReactNode;
}) {
  // What the region says, and how many times it's been told: each time is a
  // new node in it, so a screen reader reads the same words again.
  const [said, setSaid] = useState<[string, number]>(['', 0]);
  const say = useCallback((message: string) => setSaid(([, n]) => [message, n + 1]), []);
  const previous = useRef(status);
  const closedHere = useRef(false);

  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (was === status) return;
    const fromHere = closedHere.current;
    closedHere.current = false;
    if (!fromHere || was !== 'open' || status !== 'closed') return;
    say('Closed. People can’t sign up now.');
    // A tick later, once a phone's sheet has finished closing: until then its
    // focus trap would take focus back. Both headers' titles are in the page,
    // one hidden, so it's the one on screen.
    const timer = setTimeout(() => {
      const titles = Array.from(document.querySelectorAll<HTMLElement>('[data-signup-title]'));
      titles.find((title) => title.getClientRects().length > 0)?.focus();
    });
    return () => clearTimeout(timer);
  }, [status, say]);

  return (
    <ClosedHere.Provider value={closedHere}>
      <Say.Provider value={say}>{children}</Say.Provider>
      {/* Last, so the layout's spacing between the headers and the tabs stays
          as it was. */}
      <p role="status" className="sr-only">
        <span key={said[1]}>{said[0]}</span>
      </p>
    </ClosedHere.Provider>
  );
}
