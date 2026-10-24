'use client';

import { Send } from 'lucide-react';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import type { SignupStatus } from '@/schemas/signups';
import { BAR_BUTTON, PRIMARY } from './header-buttons';
import { hasPhoneBar } from './phone-bar';
import { ShareButton } from './ShareButton';
import { StatusActionButtonForm, StatusActionRefusal } from './StatusActionForm';

interface PhoneBarProps {
  status: SignupStatus;
  /** From `spotsTakenLine`; null for a draft, which has nothing to count. */
  spotsTaken: string | null;
}

/**
 * A phone's bar along the bottom of the screen, over the page and under any
 * sheet: a draft's Publish and share, filling it, or an open signup's count
 * and Share, which opens the share sheet and gets the focus back when it
 * closes. Publish runs in `SignupHeader`'s scope, so a refusal shows here,
 * just above the button, and the share sheet opens once it has published.
 * A closed or archived signup has no bar. The layout leaves room for it at
 * the bottom of the page (`PHONE_BAR_ROOM`).
 */
export function PhoneBar({ status, spotsTaken }: PhoneBarProps) {
  if (!hasPhoneBar(status)) return null;
  return (
    <div
      data-phone-bar
      className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-sunk bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
    >
      {status === 'draft' ? (
        <>
          <StatusActionRefusal className="pb-3" />
          <StatusActionButtonForm>
            <AsyncSubmitButton loadingLabel="Publishing…" className={`${BAR_BUTTON} ${PRIMARY}`}>
              <Send size={16} aria-hidden="true" />
              Publish and share
            </AsyncSubmitButton>
          </StatusActionButtonForm>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <span className="shrink-0 pl-0.5 text-sm text-ink-muted">{spotsTaken}</span>
          <div className="min-w-0 flex-1">
            <ShareButton variant="phone" />
          </div>
        </div>
      )}
    </div>
  );
}
