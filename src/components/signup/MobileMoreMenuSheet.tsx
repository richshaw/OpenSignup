'use client';

import { useState, type ReactNode } from 'react';
import { XCircle } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { SignupStatus } from '@/schemas/signups';
import { CloseSignupConfirm } from './CloseSignupConfirm';
import { SHEET_ITEM } from './header-buttons';
import { useAnnouncedStatusChange } from './HeaderAnnouncer';
import { ReopenSheetItem } from './ReopenButton';
import { StatusActionScope, type StatusChangeAction } from './StatusActionForm';

type MobileMoreMenuSheetProps = {
  open: boolean;
  onClose: () => void;
  status: SignupStatus;
  title: string;
  /** `PhonePreviewItem`, rendered on the server. */
  previewItem: ReactNode;
  closeQuestion: string;
  closeAction: StatusChangeAction;
  reopenAction: StatusChangeAction;
};

/**
 * The phone's More actions: Preview, which a computer has beside Publish and
 * share, then on an open signup Close signup, which asks first, or on a
 * closed one Reopen signup, which doesn't. Publish and Share are in the bar
 * at the bottom of the screen. Close signup runs in a scope of its own here,
 * and Reopen signup in another.
 */
export function MobileMoreMenuSheet({
  open,
  onClose,
  status,
  title,
  previewItem,
  closeQuestion,
  closeAction,
  reopenAction,
}: MobileMoreMenuSheetProps) {
  // Close signup asks first, in the sheet, as it does in the ⋯ panel on a
  // computer. The next time the sheet opens, it starts from the menu again,
  // including after Close signup itself shut it by closing the signup.
  const [confirming, setConfirming] = useState(false);
  if (!open && confirming) setConfirming(false);
  const closeSignup = useAnnouncedStatusChange(closeAction, 'closed');

  return (
    <BottomSheet open={open} onClose={onClose} title={title} compact>
      <StatusActionScope action={closeSignup}>
        {confirming ? (
          <CloseSignupConfirm phone question={closeQuestion} onNotYet={onClose} />
        ) : (
          <div className="flex flex-col">
            {/* Preview opens a new tab, so the sheet closes behind it. */}
            <div onClick={onClose}>{previewItem}</div>
            {status === 'open' ? (
              <button type="button" onClick={() => setConfirming(true)} className={SHEET_ITEM}>
                <XCircle size={16} aria-hidden="true" />
                <span>Close signup</span>
              </button>
            ) : null}
            {status === 'closed' ? <ReopenSheetItem reopenAction={reopenAction} /> : null}
          </div>
        )}
      </StatusActionScope>
    </BottomSheet>
  );
}
