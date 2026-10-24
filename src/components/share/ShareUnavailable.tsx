'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useClipboardCopy } from '@/hooks/useClipboardCopy';
import { LINK_COPY_REFUSED, ShareLinkField } from './ShareLinkField';
import type { SharePanelProps } from './SharePanel';

/**
 * What the share panel shows when its code couldn't load (a weak signal, or
 * a tab left open across an update): the link and Copy link, which are part
 * of every page's first load anyway, and a line saying a reload brings the
 * rest back. Without it, the failed load would take the page down with it.
 */
export function ShareUnavailable({ url }: Pick<SharePanelProps, 'url'>) {
  const { copied, copy } = useClipboardCopy();
  const [refused, setRefused] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    button.current?.focus();
  }, []);

  useEffect(() => {
    if (refused === 0) return;
    field.current?.focus();
    field.current?.select();
  }, [refused]);

  async function copyLink() {
    if (await copy(url)) setRefused(0);
    else setRefused((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex gap-2">
        <ShareLinkField url={url} ref={field} />
        <button
          ref={button}
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex h-10 min-w-[112px] shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-brand px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110"
        >
          {copied ? (
            <Check size={14} strokeWidth={2.6} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="text-[13px] leading-snug text-ink-muted">
        Couldn’t load the other ways to share. Reload to try again.
      </p>
      <p
        aria-live="polite"
        className={refused ? 'text-[13px] font-medium leading-snug text-danger' : 'sr-only'}
      >
        {refused ? LINK_COPY_REFUSED : copied ? 'Link copied' : ''}
      </p>
    </div>
  );
}
