'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { RotateCcw } from 'lucide-react';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { useAnnouncedStatusChange } from './HeaderAnnouncer';
import { HEADER_BUTTON, PRIMARY, SHEET_ITEM } from './header-buttons';
import {
  StatusActionButtonForm,
  StatusActionRefusal,
  StatusActionScope,
  useStatusActionPending,
  useStatusActionState,
  type StatusChangeAction,
} from './StatusActionForm';

/** The button, for the refusal to give focus back to. */
const ReopenButtonRef = createContext<RefObject<HTMLButtonElement | null> | null>(null);

/**
 * Where a closed signup's Reopen signup runs. On a computer it's round the
 * header, so the refusal can show on a line of its own under the header, as
 * Publish's does, rather than by the button, where it would push Preview
 * aside; on a phone, round the sheet's item and its refusal. Only while
 * `active`: Publish's buttons in the same header need their own scope. So
 * when the signup closes or reopens, what it wraps mounts afresh: fine for
 * the header's row today, which holds nothing worth keeping, but anything
 * added there that keeps state loses it then.
 * Once it has reopened the signup the header says so and focus moves to the
 * title (`HeaderAnnouncer`); no share panel opens, since the link is the one
 * already shared.
 */
export function ReopenScope({
  reopenAction,
  active = true,
  children,
}: {
  reopenAction: StatusChangeAction;
  active?: boolean;
  children: ReactNode;
}) {
  const reopen = useAnnouncedStatusChange(reopenAction, 'open');
  const button = useRef<HTMLButtonElement>(null);
  if (!active) return children;
  return (
    <StatusActionScope action={reopen}>
      <ReopenButtonRef.Provider value={button}>{children}</ReopenButtonRef.Provider>
    </StatusActionScope>
  );
}

/**
 * Reopen signup beside Preview in a computer's header: the header's blue
 * button, where a draft has Publish and share. It doesn't ask first: a
 * reopen by mistake is undone with Close signup, which does ask. Viewers see
 * it too, and are told they can't edit, as they are by Publish and Close
 * signup. Inside a `ReopenScope`.
 */
export function ReopenButton() {
  return (
    <Button className={`${HEADER_BUTTON} ${PRIMARY}`}>
      <RotateCcw size={15} aria-hidden="true" />
      Reopen signup
    </Button>
  );
}

/**
 * Why Reopen signup was refused (a viewer's role, a signup reopened or
 * deleted in another tab, no slots left). Hidden while a press is in flight,
 * as Close signup's is, so a retry doesn't show the last refusal under
 * "Reopening…". Once a press comes back refused, focus goes back to the
 * button: it lost focus while it was disabled, and a browser doesn't give it
 * back. Keyed on the refusal, so a closed signup's page never takes focus as
 * it loads. Inside a `ReopenScope`.
 */
export function ReopenRefusal({ className }: { className?: string }) {
  const button = useContext(ReopenButtonRef);
  const pending = useStatusActionPending();
  const state = useStatusActionState();
  const refused = !pending && state !== null && 'error' in state;
  useEffect(() => {
    if (refused) button?.current?.focus();
  }, [refused, state, button]);
  return refused ? <StatusActionRefusal className={className} /> : null;
}

/**
 * The same on a phone, as an item in the More actions sheet under Preview,
 * with its refusal under it. Behind ⋯ rather than in the bar at the bottom
 * of the screen, where Close signup's question has just been: a second tap
 * there would reopen the signup it closed. Once it reopens, the status
 * changes and the sheet shuts.
 */
export function ReopenSheetItem({ reopenAction }: { reopenAction: StatusChangeAction }) {
  return (
    <ReopenScope reopenAction={reopenAction}>
      <Button className={SHEET_ITEM}>
        <RotateCcw size={16} aria-hidden="true" />
        <span>Reopen signup</span>
      </Button>
      <ReopenRefusal className="pb-3" />
    </ReopenScope>
  );
}

function Button({ className, children }: { className: string; children: ReactNode }) {
  const button = useContext(ReopenButtonRef);
  return (
    <StatusActionButtonForm>
      <AsyncSubmitButton ref={button} loadingLabel="Reopening…" className={className}>
        {children}
      </AsyncSubmitButton>
    </StatusActionButtonForm>
  );
}
