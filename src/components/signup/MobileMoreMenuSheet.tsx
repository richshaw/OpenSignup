'use client';

import Link from 'next/link';
import { ChevronRight, Download, Send, XCircle } from 'lucide-react';
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
  signupId: string;
  status: SignupStatus;
  title: string;
  publishAction: StatusAction;
  closeAction: StatusAction;
};

export function MobileMoreMenuSheet({
  open,
  onClose,
  signupId,
  status,
  title,
  publishAction,
  closeAction,
}: MobileMoreMenuSheetProps) {
  const exportHref = `/api/signups/${signupId}/export.csv`;

  return (
    <BottomSheet open={open} onClose={onClose} title={title} compact>
      <div className="flex flex-col">
        <Link
          href={exportHref}
          onClick={onClose}
          className="flex items-center gap-3 py-3.5 text-[15px] text-ink"
        >
          <Download size={16} aria-hidden="true" />
          <span className="flex-1">Export responses</span>
          <ChevronRight size={14} className="text-ink-soft" aria-hidden="true" />
        </Link>

        <StatusActionScope action={status === 'draft' ? publishAction : closeAction}>
          {status === 'draft' ? (
            <StatusActionButtonForm className="border-t border-surface-sunk">
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
            <StatusActionButtonForm className="border-t border-surface-sunk">
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
