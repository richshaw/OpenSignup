'use client';

import { useState, type ReactNode } from 'react';
import { XCircle } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { SignupStatus } from '@/schemas/signups';
import { CloseSignupConfirm } from './CloseSignupConfirm';
import { SHEET_ITEM } from './header-buttons';
import { useAnnouncedClose } from './HeaderAnnouncer';
import { StatusActionScope, type StatusAction } from './StatusActionForm';

type MobileMoreMenuSheetProps = {
  open: boolean;
  onClose: () => void;
  status: SignupStatus;
  title: string;
  /** `PhonePreviewItem`, rendered on the server. */
  previewItem: ReactNode;
  closeQuestion: string;
  closeAction: StatusAction;
};

/**
 * The phone's More actions: Preview, which a computer has beside Publish and
 * share, and on an open signup Close signup, which asks first. Publish and
 * Share are in the bar at the bottom of the screen. Close signup runs in a
 * scope of its own here.
 */
export function MobileMoreMenuSheet({
  open,
  onClose,
  status,
  title,
  previewItem,
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
      <StatusActionScope action={closeSignup}>
        {confirming ? (
          <CloseSignupConfirm phone question={closeQuestion} onNotYet={close} />
        ) : (
          <div className="flex flex-col">
            {/* Preview opens a new tab, so the sheet closes behind it. */}
            <div onClick={close}>{previewItem}</div>
            {status === 'open' ? (
              <button type="button" onClick={() => setConfirming(true)} className={SHEET_ITEM}>
                <XCircle size={16} aria-hidden="true" />
                <span>Close signup</span>
              </button>
            ) : null}
          </div>
        )}
      </StatusActionScope>
    </BottomSheet>
  );
}
