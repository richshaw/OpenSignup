'use client';

import { Send, XCircle } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import type { SignupStatus } from '@/schemas/signups';
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
  publishAction: StatusAction;
  closeAction: StatusAction;
};

export function MobileMoreMenuSheet({
  open,
  onClose,
  status,
  title,
  publishAction,
  closeAction,
}: MobileMoreMenuSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title} compact>
      <div className="flex flex-col">
        <StatusActionScope action={status === 'draft' ? publishAction : closeAction}>
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
            <StatusActionButtonForm>
              <AsyncSubmitButton
                loadingLabel="Closing…"
                className="flex w-full py-3.5 text-[15px] font-medium text-ink"
              >
                <XCircle size={16} aria-hidden="true" />
                <span>Close signup</span>
              </AsyncSubmitButton>
              <StatusActionRefusal className="pb-3" />
            </StatusActionButtonForm>
          ) : null}
        </StatusActionScope>
      </div>
    </BottomSheet>
  );
}
