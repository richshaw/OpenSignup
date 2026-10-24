'use client';

import dynamic from 'next/dynamic';
import { useId, useRef } from 'react';
import { Share2 } from 'lucide-react';
import { PublishedMark, shareHeading } from '@/components/share/share-heading';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Popover } from '@/components/ui/Popover';
import { Spinner } from '@/components/ui/spinner';
import { useShare } from './ShareScope';

// The panel's body, its QR encoder with it, loads only when it first opens,
// so none of it is in a signup page's first load.
const SharePanel = dynamic(
  () => import('@/components/share/SharePanel').then((m) => m.SharePanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-40 items-center justify-center text-ink-soft">
        <Spinner />
      </div>
    ),
  },
);

/**
 * An open signup's Share, and the share panel it opens: a popover under the
 * button on a computer, a sheet on a phone. Closing the panel (its ✕,
 * Escape, a click outside) puts focus back on this button, which is also
 * where it goes after the panel Publish opened, since Publish is gone.
 */
export function ShareButton({ variant }: { variant: 'desktop' | 'phone' }) {
  const share = useShare();
  const trigger = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const desktop = variant === 'desktop';
  const shown = share.open && share.desktop === desktop;

  const panel = (
    <SharePanel
      variant={variant}
      firstTime={share.firstTime}
      title={share.title}
      url={share.url}
      message={share.message}
      onMessageChange={share.setMessage}
      onClose={share.closeShare}
      headingId={headingId}
    />
  );

  const button = (
    <button
      ref={trigger}
      type="button"
      onClick={() => (shown ? share.closeShare() : share.openShare())}
      aria-haspopup="dialog"
      aria-expanded={shown}
      className={
        desktop
          ? 'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110'
          : 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[15px] font-semibold text-white transition hover:brightness-110'
      }
    >
      <Share2 size={desktop ? 14 : 16} aria-hidden="true" />
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
          className="w-[420px] max-w-[calc(100vw-2rem)] p-[18px]"
        >
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
