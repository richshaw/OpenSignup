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
import type { StatusChangeAction } from './StatusActionForm';

// The status a button on this page has just changed the signup to, set when
// its action answers, and read when the header next sees its status change.
const AskedFor = createContext<RefObject<SignupStatus | null> | null>(null);

/**
 * `action`, telling the header when it has changed the signup's status to
 * `to`, so the header can say so and move focus. A signup changed some other
 * way (another tab, an AI assistant) shows its new status when the page next
 * reloads its data, without either.
 *
 * Only for an action that answers null once it has changed the status and
 * takes no form (`StatusChangeAction`). Publish takes a form and answers
 * `{ published: true }`, so it can't come through here: it says what it did
 * through the share panel (`useAnnounce`).
 */
export function useAnnouncedStatusChange(
  action: StatusChangeAction,
  to: SignupStatus,
): StatusChangeAction {
  const askedFor = useContext(AskedFor);
  return async () => {
    const refusal = await action();
    if (!refusal && askedFor) askedFor.current = to;
    return refusal;
  };
}

// What the header says after a change this page asked for, by the status the
// signup changed from and then to; any other change says nothing. It goes by
// both on purpose, not by the new status alone, so each message is said only
// for the change it describes: reaching open from a draft is a publish, not
// what reopening a closed signup says.
const ANNOUNCED: Partial<Record<SignupStatus, Partial<Record<SignupStatus, string>>>> = {
  open: { closed: 'Closed. People can’t sign up now.' },
  closed: { open: 'Reopened. People can sign up again.' },
};

const Say = createContext<(message: string) => void>(() => {});

/**
 * The last status change the page has shown: the status the signup changed
 * to, whether a button on this page made it (`here`; not when another tab or
 * an AI assistant did), and a number so each change is its own. Null until
 * there's been one.
 */
type StatusChange = { to: SignupStatus; here: boolean; n: number } | null;
const Changed = createContext<StatusChange>(null);

/** The last status change the page has shown; see `StatusChange`. */
export function useLastStatusChange(): StatusChange {
  return useContext(Changed);
}

/**
 * Moves focus to the signup's title. Both headers' titles are in the page,
 * one hidden, so it's the one on screen.
 */
export function focusTitle(): void {
  const titles = Array.from(document.querySelectorAll<HTMLElement>('[data-signup-title]'));
  titles.find((title) => title.getClientRects().length > 0)?.focus();
}

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
 * Holds the computer and phone headers, and the closed box under them, with
 * one live region that says what a change made from this page did: Close
 * signup's, from the ⋯, and Reopen signup's, from beside Preview or the
 * phone's ⋯. A status change takes away the button that made it, and the
 * focus with it (Close signup goes with the ⋯ that held it, Reopen signup
 * once the signup is open), so focus goes to the signup's title rather than
 * to the page. The closed box reads `useLastStatusChange` to show only after
 * this page's own Close signup.
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
  const askedFor = useRef<SignupStatus | null>(null);
  const [changed, setChanged] = useState<StatusChange>(null);

  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (was === status) return;
    const asked = askedFor.current;
    askedFor.current = null;
    const here = asked === status;
    // Every change, not only this page's, so a close made elsewhere after
    // one made here doesn't count as this page's.
    setChanged((last) => ({ to: status, here, n: (last?.n ?? 0) + 1 }));
    const words = here ? ANNOUNCED[was]?.[status] : undefined;
    if (!words) return;
    say(words);
    // A tick later, once a phone's sheet has finished closing: until then its
    // focus trap would take focus back.
    const timer = setTimeout(focusTitle);
    return () => clearTimeout(timer);
  }, [status, say]);

  return (
    <AskedFor.Provider value={askedFor}>
      <Say.Provider value={say}>
        <Changed.Provider value={changed}>{children}</Changed.Provider>
      </Say.Provider>
      {/* Last, after the headers and the closed box, so the layout's
          spacing between them and the tabs stays as it was. */}
      <p role="status" className="sr-only">
        <span key={said[1]}>{said[0]}</span>
      </p>
    </AskedFor.Provider>
  );
}
