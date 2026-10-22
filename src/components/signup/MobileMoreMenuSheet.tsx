'use client';

import { Send, XCircle } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import type { SignupStatus } from '@/schemas/signups';

type MobileMoreMenuSheetProps = {
  open: boolean;
  onClose: () => void;
  status: SignupStatus;
  title: string;
  publishAction: () => void | Promise<void>;
  closeAction: () => void | Promise<void>;
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
        {status === 'draft' ? (
          <form action={publishAction}>
            <AsyncSubmitButton
              loadingLabel="Publishing…"
              className="flex w-full py-3.5 text-[15px] font-semibold text-brand"
            >
              <Send size={16} aria-hidden="true" />
              <span>Publish signup</span>
            </AsyncSubmitButton>
          </form>
        ) : null}

        {status === 'open' ? (
          <form action={closeAction}>
            <AsyncSubmitButton
              loadingLabel="Closing…"
              className="flex w-full py-3.5 text-[15px] font-medium text-ink"
            >
              <XCircle size={16} aria-hidden="true" />
              <span>Close signup</span>
            </AsyncSubmitButton>
          </form>
        ) : null}
      </div>
    </BottomSheet>
  );
}
