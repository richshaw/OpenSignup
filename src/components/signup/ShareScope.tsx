'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAnnounce } from './HeaderAnnouncer';
import { PublishState } from './PublishButton';
import { StatusActionScope, useStatusActionState, type StatusAction } from './StatusActionForm';

interface Share {
  /** Whether the share panel is open, in whichever header is on screen. */
  open: boolean;
  /** Opened by Publish: says it published, and that nobody has the link yet. */
  firstTime: boolean;
  /** A computer's popover or a phone's sheet; null until the window can be asked. */
  desktop: boolean | null;
  /** The signup the link is for, so a copy or a share is recorded against it. */
  signupId: string;
  title: string;
  url: string;
  /** The message to send with the link, as the organizer last left it. */
  message: string;
  setMessage: (message: string) => void;
  openShare: () => void;
  closeShare: () => void;
}

const ShareContext = createContext<Share | null>(null);

export function useShare(): Share {
  const share = useContext(ShareContext);
  if (!share) throw new Error('useShare must be used inside <ShareScope>');
  return share;
}

/**
 * Publish, from either header, and the share panel it opens. One
 * `StatusActionScope` runs Publish for the computer's header and the phone's
 * bar both, and `PublishState` saves the Build tab's edits before it, starts
 * loading the panel's code as it's pressed, and holds the check Publish can
 * answer with.
 *
 * The share panel's state is for the computer and phone headers both: one
 * panel, shown as a popover by the computer's Share button or as a sheet on
 * a phone, never both. Publish on this page answering that it published
 * opens it in its first-time form, and has the header say so. A signup
 * published elsewhere does neither.
 *
 * The message is the server's, built from the signup, until the organizer
 * edits it; then the edit is kept while the page is open, so reopening the
 * panel shows it. Until then a fresher message from the server (the layout
 * re-renders after Publish) replaces the one the page loaded with.
 */
export function ShareScope({
  publishAction,
  ...props
}: ShareStateProps & { publishAction: StatusAction }) {
  return (
    <StatusActionScope action={publishAction}>
      <PublishState>
        <ShareState {...props} />
      </PublishState>
    </StatusActionScope>
  );
}

interface ShareStateProps {
  signupId: string;
  title: string;
  url: string;
  message: string;
  children: ReactNode;
}

function ShareState({ signupId, title, url, message: serverMessage, children }: ShareStateProps) {
  const [open, setOpen] = useState(false);
  const [firstTime, setFirstTime] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  const desktop = useMediaQuery('(min-width: 768px)');

  // Only an answer that arrives while this is mounted opens the panel.
  const result = useStatusActionState();
  const handled = useRef(result);
  const say = useAnnounce();
  useEffect(() => {
    if (result === handled.current) return;
    handled.current = result;
    if (result && 'published' in result) {
      setFirstTime(true);
      setOpen(true);
      say('Published. Anyone with the link can sign up now.');
    }
  }, [result, say]);

  const openShare = useCallback(() => {
    setFirstTime(false);
    setOpen(true);
  }, []);
  const closeShare = useCallback(() => setOpen(false), []);

  const value = useMemo<Share>(
    () => ({
      open,
      firstTime,
      desktop,
      signupId,
      title,
      url,
      message: edited ?? serverMessage,
      setMessage: setEdited,
      openShare,
      closeShare,
    }),
    [open, firstTime, desktop, signupId, title, url, edited, serverMessage, openShare, closeShare],
  );
  return <ShareContext.Provider value={value}>{children}</ShareContext.Provider>;
}
