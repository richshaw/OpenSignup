'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, XCircle } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { CloseSignupConfirm } from './CloseSignupConfirm';
import { useAnnouncedClose } from './HeaderAnnouncer';
import { StatusActionScope, useStatusActionPending, type StatusAction } from './StatusActionForm';

interface MoreActionsMenuProps {
  closeQuestion: string;
  closeAction: StatusAction;
}

/**
 * The ⋯ beside Preview on an open signup, on a computer. Its one item, Close
 * signup, asks first in the same panel: a signup can't be reopened, so
 * closing it is never one click in the spot where Publish was.
 */
export function MoreActionsMenu({ closeQuestion, closeAction }: MoreActionsMenuProps) {
  const closeSignup = useAnnouncedClose(closeAction);
  return (
    <StatusActionScope action={closeSignup}>
      <Menu closeQuestion={closeQuestion} />
    </StatusActionScope>
  );
}

function Menu({ closeQuestion }: { closeQuestion: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pending = useStatusActionPending();
  const trigger = useRef<HTMLButtonElement>(null);
  const closeItem = useRef<HTMLButtonElement>(null);

  function openMenu() {
    setOpen(true);
    // The question counts the spots taken, and the header's counts are from
    // when the page loaded: switching tabs doesn't reload them.
    router.refresh();
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
        className="inline-flex items-center justify-center rounded-lg border border-surface-sunk p-1.5 transition hover:bg-surface-raised"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
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
            <CloseSignupConfirm question={closeQuestion} onNotYet={close} />
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
