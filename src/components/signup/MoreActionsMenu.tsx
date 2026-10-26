'use client';

import { useRef, useState } from 'react';
import { MoreHorizontal, XCircle } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import {
  CloseSignupConfirm,
  useCloseQuestion,
  type CloseQuestionAction,
} from './CloseSignupConfirm';
import { OUTLINED } from './header-buttons';
import { useAnnouncedStatusChange } from './HeaderAnnouncer';
import {
  StatusActionScope,
  useStatusActionPending,
  type StatusChangeAction,
} from './StatusActionForm';

interface MoreActionsMenuProps {
  closeQuestion: string;
  closeQuestionAction: CloseQuestionAction;
  closeAction: StatusChangeAction;
}

/**
 * The ⋯ beside Share on an open signup, on a computer. Its one item, Close
 * signup, asks first in the same panel: a closed signup turns everyone away
 * until the organizer reopens it, so closing it is never one click in the
 * spot where Publish was.
 */
export function MoreActionsMenu({
  closeQuestion,
  closeQuestionAction,
  closeAction,
}: MoreActionsMenuProps) {
  const closeSignup = useAnnouncedStatusChange(closeAction, 'closed');
  return (
    <StatusActionScope action={closeSignup}>
      <Menu closeQuestion={closeQuestion} closeQuestionAction={closeQuestionAction} />
    </StatusActionScope>
  );
}

function Menu({
  closeQuestion,
  closeQuestionAction,
}: Pick<MoreActionsMenuProps, 'closeQuestion' | 'closeQuestionAction'>) {
  const [question, askAgain] = useCloseQuestion(closeQuestion, closeQuestionAction);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pending = useStatusActionPending();
  const trigger = useRef<HTMLButtonElement>(null);
  const closeItem = useRef<HTMLButtonElement>(null);

  function openMenu() {
    setOpen(true);
    askAgain();
  }

  // Held open while Close signup is in flight, so a refusal has somewhere to
  // show. Once it closes the signup, this menu is gone from the header.
  function close() {
    if (pending) return;
    setOpen(false);
    setConfirming(false);
  }

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => (open ? close() : openMenu())}
        aria-label="More actions"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${OUTLINED}`}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      <Popover
        open={open}
        onClose={close}
        triggerRef={trigger}
        initialFocusRef={closeItem}
        label="More actions"
        className="w-80 p-2"
      >
        {confirming ? (
          <div className="p-1.5">
            <CloseSignupConfirm question={question} onNotYet={close} />
          </div>
        ) : (
          <button
            ref={closeItem}
            type="button"
            onClick={() => setConfirming(true)}
            className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium text-ink hover:bg-surface-raised"
          >
            <XCircle size={15} aria-hidden="true" />
            Close signup
          </button>
        )}
      </Popover>
    </div>
  );
}
