'use client';

import type { SignupStatus } from '@/schemas/signups';
import { hasPhoneBar } from './phone-bar';
import { PublishButton, PublishRefusal } from './PublishButton';
import { ShareButton } from './ShareButton';

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
 * just above the button, its check opens a sheet over the bar, and the
 * share sheet opens once it has published.
 * A closed or archived signup has no bar. The layout leaves room for it at
 * the bottom of the page (`PHONE_BAR_ROOM`).
 */
export function PhoneBar({ status, spotsTaken }: PhoneBarProps) {
  if (!hasPhoneBar(status)) return null;
  return (
    <div
      ref={measure}
      data-phone-bar
      className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-sunk bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
    >
      {status === 'draft' ? (
        <>
          <PublishRefusal className="pb-3" />
          <PublishButton variant="phone" />
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

/**
 * Puts the bar's height on the page as --phone-bar-h, while the bar is there:
 * the room the layout leaves under the page, and the page's
 * scroll-padding-bottom, so a control Tab brings into view stops above the
 * bar. It grows when a refusal shows, and is 0 on a computer, where the bar is
 * hidden. A ref callback with a cleanup, so it starts and stops with the bar.
 */
function measure(el: HTMLDivElement | null) {
  if (!el || typeof ResizeObserver === 'undefined') return;
  const root = document.documentElement.style;
  const observer = new ResizeObserver(() =>
    root.setProperty('--phone-bar-h', `${el.offsetHeight}px`),
  );
  observer.observe(el, { box: 'border-box' });
  return () => {
    observer.disconnect();
    root.removeProperty('--phone-bar-h');
  };
}
