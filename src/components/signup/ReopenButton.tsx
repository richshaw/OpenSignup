'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
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

/**
 * A closed signup's Reopen signup, beside Preview in the header on a
 * computer: the header's blue button, where a draft has Publish and share.
 * Once it has reopened the signup the header says so and focus moves to the
 * title (`HeaderAnnouncer`); no share panel opens, since the link is the one
 * already shared. It doesn't ask first: a reopen by mistake is undone with
 * Close signup, which does ask. A refusal (a viewer's role, a signup
 * reopened or deleted in another tab, no slots left) shows under it, and
 * focus comes back to the button. Viewers see it too, and are told they
 * can't edit, as they are by Publish and Close signup.
 */
export function ReopenButton({ reopenAction }: { reopenAction: StatusChangeAction }) {
  return (
    <Reopen
      reopenAction={reopenAction}
      className="flex flex-col items-end"
      buttonClassName={`${HEADER_BUTTON} ${PRIMARY}`}
      refusalClassName="mt-2 max-w-xs"
    >
      <RotateCcw size={15} aria-hidden="true" />
      Reopen signup
    </Reopen>
  );
}

/**
 * The same on a phone, as an item in the More actions sheet under Preview.
 * Behind ⋯ rather than in the bar at the bottom of the screen, where Close
 * signup's question has just been: a second tap there would reopen the
 * signup it closed. Once it reopens, the status changes and the sheet shuts.
 */
export function ReopenSheetItem({ reopenAction }: { reopenAction: StatusChangeAction }) {
  return (
    <Reopen reopenAction={reopenAction} buttonClassName={SHEET_ITEM} refusalClassName="pb-3">
      <RotateCcw size={16} aria-hidden="true" />
      <span>Reopen signup</span>
    </Reopen>
  );
}

function Reopen({
  reopenAction,
  className,
  buttonClassName,
  refusalClassName,
  children,
}: {
  reopenAction: StatusChangeAction;
  className?: string;
  buttonClassName: string;
  refusalClassName: string;
  children: ReactNode;
}) {
  const reopen = useAnnouncedStatusChange(reopenAction, 'open');
  const button = useRef<HTMLButtonElement>(null);
  return (
    <StatusActionScope action={reopen}>
      <div className={className}>
        <StatusActionButtonForm>
          <AsyncSubmitButton ref={button} loadingLabel="Reopening…" className={buttonClassName}>
            {children}
          </AsyncSubmitButton>
        </StatusActionButtonForm>
        <Refusal button={button} className={refusalClassName} />
      </div>
    </StatusActionScope>
  );
}

// Hidden while a press is in flight, as Close signup's is, so a retry
// doesn't show the last refusal under "Reopening…". Once a press comes back
// refused, focus goes back to the button: it lost focus while it was
// disabled, and a browser doesn't give it back. Keyed on the refusal, so a
// closed signup's page never takes focus as it loads.
function Refusal({
  button,
  className,
}: {
  button: RefObject<HTMLButtonElement | null>;
  className: string;
}) {
  const pending = useStatusActionPending();
  const state = useStatusActionState();
  const refused = !pending && state !== null && 'error' in state;
  useEffect(() => {
    if (refused) button.current?.focus();
  }, [refused, state, button]);
  return refused ? <StatusActionRefusal className={className} /> : null;
}
