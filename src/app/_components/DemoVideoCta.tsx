'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { emitLandingCtaClicked } from './landingCtaTelemetry';

interface DemoVideoCtaProps {
  videoUrl: string;
  posterUrl?: string;
}

export function DemoVideoCta({ videoUrl, posterUrl }: DemoVideoCtaProps) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const openModal = useCallback(() => {
    emitLandingCtaClicked('demo_video');
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="bg-surface border-surface-sunk text-ink hover:bg-surface-raised inline-flex items-center justify-center gap-2 rounded-[14px] border px-5 py-3 text-base font-medium transition lg:text-[15px]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" />
        </svg>
        Watch demo
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Product demo video"
          className="bg-ink/60 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="relative w-full max-w-3xl">
            <button
              type="button"
              onClick={close}
              aria-label="Close video"
              className="bg-surface text-ink hover:bg-surface-raised absolute -top-12 right-0 inline-flex h-9 w-9 items-center justify-center rounded-full shadow-md transition"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
            <div className="aspect-video overflow-hidden rounded-2xl bg-black shadow-2xl">
              <video
                ref={videoRef}
                src={videoUrl}
                poster={posterUrl}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="h-full w-full"
              >
                <track kind="captions" />
              </video>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
