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
  type StatusAction,
} from './StatusActionForm';

type MobileMoreMenuSheetProps = {
  open: boolean;
  onClose: () => void;
  status: SignupStatus;
  title: string;
  closeQuestion: string;
  publishAction: StatusAction;
  closeAction: StatusAction;
};

export function MobileMoreMenuSheet({
  open,
  onClose,
  status,
  title,
  closeQuestion,
  publishAction,
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
        <StatusActionScope action={status === 'draft' ? publishAction : closeSignup}>
          {status === 'draft' ? (
            <StatusActionButtonForm>
              <AsyncSubmitButton
                loadingLabel="Publishing…"
                className="flex w-full py-3.5 text-[15px] font-semibold text-brand"
              >
                <Send size={16} aria-hidden="true" />
                <span>Publish signup</span>
              </AsyncSubmitButton>
              <StatusActionRefusal className="pb-3" />
            </StatusActionButtonForm>
          ) : null}

          {status === 'open' ? (
            confirming ? (
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
            )
          ) : null}
        </StatusActionScope>
      </div>
    </BottomSheet>
  );
}
