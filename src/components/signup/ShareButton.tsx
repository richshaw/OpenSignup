'use client';

import { Suspense, useId, useRef } from 'react';
import { Share2, X } from 'lucide-react';
import { SharePanel, usePrefetchSharePanel } from '@/components/share/load-share-panel';
import { PublishedMark, shareHeading } from '@/components/share/share-heading';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Popover } from '@/components/ui/Popover';
import { Spinner } from '@/components/ui/spinner';
import { BAR_BUTTON, HEADER_BUTTON, PRIMARY } from './header-buttons';
import { useShare } from './ShareScope';

/**
 * An open signup's Share, and the share panel it opens: a popover under the
 * button in a computer's header, a sheet from the bar at the bottom of a
 * phone's screen. Escape or the panel's ✕ puts focus back on this button, as
 * does a tap outside a phone's sheet; it's also where focus goes after the
 * panel Publish and share opened, since that button is gone, and this one
 * has taken its place. A click outside the popover leaves focus where it
 * landed.
 */
export function ShareButton({ variant }: { variant: 'desktop' | 'phone' }) {
  const share = useShare();
  const trigger = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const desktop = variant === 'desktop';
  const shown = share.open && share.desktop === desktop;
  usePrefetchSharePanel();

  // The panel's body, its QR encoder with it, loads once the page is idle (or
  // as Publish is pressed, or when it first opens), so none of it is in a
  // signup page's first load. Its heading and ✕ are below, so the panel is
  // named and can be closed while the body loads, and if it never does.
  const panel = (
    <Suspense
      fallback={
        <div className="flex min-h-40 items-center justify-center text-ink-soft">
          <Spinner />
        </div>
      }
    >
      <SharePanel
        variant={variant}
        firstTime={share.firstTime}
        signupId={share.signupId}
        title={share.title}
        url={share.url}
        message={share.message}
        onMessageChange={share.setMessage}
      />
    </Suspense>
  );

  const button = (
    <button
      ref={trigger}
      type="button"
      onClick={() => (shown ? share.closeShare() : share.openShare())}
      aria-haspopup="dialog"
      aria-expanded={shown}
      className={`${desktop ? HEADER_BUTTON : BAR_BUTTON} ${PRIMARY}`}
    >
      <Share2 size={desktop ? 15 : 16} aria-hidden="true" />
      Share
    </button>
  );

  if (desktop) {
    return (
      <div className="relative">
        {button}
        <Popover
          open={shown}
          onClose={share.closeShare}
          triggerRef={trigger}
          labelledBy={headingId}
          className="flex w-[420px] max-w-[calc(100vw-2rem)] flex-col gap-3.5 p-[18px]"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              {share.firstTime ? <PublishedMark /> : null}
              <h2 id={headingId} className="text-base font-semibold tracking-tight text-ink">
                {shareHeading(share.firstTime)}
              </h2>
            </div>
            <button
              type="button"
              onClick={share.closeShare}
              aria-label="Close"
              className="-mr-1.5 -mt-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-raised"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {panel}
        </Popover>
      </div>
    );
  }

  return (
    <>
      {button}
      <BottomSheet
        open={shown}
        onClose={share.closeShare}
        title={shareHeading(share.firstTime)}
        description={share.firstTime ? <PublishedMark /> : undefined}
        compact
        // The panel puts focus on its first button once it has loaded; until
        // then the sheet holds it, rather than on the ✕.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          trigger.current?.focus();
        }}
      >
        {panel}
      </BottomSheet>
    </>
  );
}
