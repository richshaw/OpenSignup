'use client';

import { useState } from 'react';
import { Send, XCircle } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import type { SignupStatus } from '@/schemas/signups';
import { CloseSignupConfirm } from './CloseSignupConfirm';
import { useAnnouncedClose } from './HeaderAnnouncer';
import {
  StatusActionButtonForm,
  StatusActionRefusal,
  StatusActionScope,
  useStatusActionPending,
  type StatusAction,
} from './StatusActionForm';

type MobileMoreMenuSheetProps = {
  open: boolean;
  onClose: () => void;
  status: SignupStatus;
  title: string;
  closeQuestion: string;
  closeAction: StatusAction;
};

/**
 * The phone's More actions: Publish signup, or Close signup, which asks
 * first. Publish runs in `SignupHeader`'s `StatusActionScope`, which outlives
 * this sheet, so its answer still opens the share sheet once this one has
 * closed. Close signup runs in a scope of its own here.
 */
export function MobileMoreMenuSheet({
  open,
  onClose,
  status,
  title,
  closeQuestion,
  closeAction,
}: MobileMoreMenuSheetProps) {
  // Close signup asks first, in the sheet, as it does in the ⋯ panel on a
  // computer. The next time the sheet opens, it starts from the menu again.
  const [confirming, setConfirming] = useState(false);
  const closeSignup = useAnnouncedClose(closeAction);
  function close() {
    setConfirming(false);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={close} title={title} compact>
      <div className="flex flex-col">
        {status === 'draft' ? <PublishItem /> : null}

        {status === 'open' ? (
          <StatusActionScope action={closeSignup}>
            {confirming ? (
              <CloseSignupConfirm phone question={closeQuestion} onNotYet={close} />
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="flex w-full items-center gap-2 py-3.5 text-[15px] font-medium text-ink"
              >
                <XCircle size={16} aria-hidden="true" />
                <span>Close signup</span>
              </button>
            )}
          </StatusActionScope>
        ) : null}
      </div>
    </BottomSheet>
  );
}

/**
 * Publish signup, in the header's scope. Its refusal shows only for a press
 * made since the sheet opened, as Close signup's does: the scope outlives
 * the sheet, and an old refusal would otherwise come back with it.
 */
function PublishItem() {
  const pending = useStatusActionPending();
  const [pressed, setPressed] = useState(false);
  return (
    <StatusActionButtonForm>
      <AsyncSubmitButton
        loadingLabel="Publishing…"
        onClick={() => setPressed(true)}
        className="flex w-full py-3.5 text-[15px] font-semibold text-brand"
      >
        <Send size={16} aria-hidden="true" />
        <span>Publish signup</span>
      </AsyncSubmitButton>
      {pressed && !pending ? <StatusActionRefusal className="pb-3" /> : null}
    </StatusActionButtonForm>
  );
}
