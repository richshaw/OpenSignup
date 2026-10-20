'use client';

import Link from 'next/link';
import { ChevronRight, Download, Send, XCircle } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import type { SignupStatus } from '@/schemas/signups';
import { StatusActionForm, type StatusAction } from './StatusActionForm';

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

        {status === 'draft' ? (
          <StatusActionForm
            action={publishAction}
            className="border-t border-surface-sunk"
            errorClassName="pb-3"
          >
            <AsyncSubmitButton
              loadingLabel="Publishing…"
              className="flex w-full py-3.5 text-[15px] font-semibold text-brand"
            >
              <Send size={16} aria-hidden="true" />
              <span>Publish signup</span>
            </AsyncSubmitButton>
          </StatusActionForm>
        ) : null}

        {status === 'open' ? (
          <StatusActionForm
            action={closeAction}
            className="border-t border-surface-sunk"
            errorClassName="pb-3"
          >
            <AsyncSubmitButton
              loadingLabel="Closing…"
              className="flex w-full py-3.5 text-[15px] font-medium text-ink"
            >
              <XCircle size={16} aria-hidden="true" />
              <span>Close signup</span>
            </AsyncSubmitButton>
          </StatusActionForm>
        ) : null}
      </div>
    </BottomSheet>
  );
}
