'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, Copy, Mail, Share, X } from 'lucide-react';
import { useClipboardCopy } from '@/hooks/useClipboardCopy';
import { withLink } from '@/lib/share-message';
import { ShareQrCode } from './ShareQrCode';
import { PublishedMark, shareHeading } from './share-heading';

export interface SharePanelProps {
  /** A popover by the header's button on a computer, a sheet on a phone. */
  variant: 'desktop' | 'phone';
  /** Just published: says so, and that nobody has the link yet. */
  firstTime: boolean;
  /** The signup's title: the email's subject and the shared title. */
  title: string;
  /** The public link. */
  url: string;
  /**
   * The message to send with the link. The panel's owner keeps it, so an
   * edit is still there when the panel opens again.
   */
  message: string;
  onMessageChange: (message: string) => void;
  /** The ✕. */
  onClose: () => void;
  /** The heading's id, for the popover's `aria-labelledby`. */
  headingId?: string;
}

const LEAD_FIRST_TIME = 'Anyone with the link can sign up. Nobody has it until you send it.';
const LEAD_LATER = {
  desktop: 'Send it by email or in a group chat. Anyone with the link can sign up.',
  phone: 'Send it to a group chat, by text or by email. Anyone with the link can sign up.',
} as const;

/**
 * Ways to send a published signup's link: copy it, copy or email a message
 * with it, a QR code, and on a phone the phone's own share menu. Everything
 * happens in the browser or the organizer's own apps; nothing is sent to us
 * or to anyone else. Loaded only when it opens.
 *
 * On a computer the panel has its own heading and ✕. On a phone the sheet
 * around it has them (`shareHeading`), since the sheet's dialog needs its
 * title in place the moment it opens, before this has loaded.
 *
 * Focus goes to the first way to send it: Copy link, or Share… where the
 * phone has a share menu.
 */
export function SharePanel({
  variant,
  firstTime,
  title,
  url,
  message,
  onMessageChange,
  onClose,
  headingId,
}: SharePanelProps) {
  const link = useClipboardCopy();
  const messageCopy = useClipboardCopy();
  // Whether to offer Share…: only on a phone that has a share menu. Decided
  // after mount, so a server render and the first client render agree, but
  // before paint, so the buttons don't move once they're seen.
  const [canShare, setCanShare] = useState<boolean | null>(variant === 'phone' ? null : false);
  const [shared, setShared] = useState(false);
  const linkId = useId();
  const messageId = useId();
  const copyRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const focused = useRef(false);

  useLayoutEffect(() => {
    if (variant === 'phone') setCanShare(typeof navigator.share === 'function');
  }, [variant]);

  useEffect(() => {
    if (canShare === null || focused.current) return;
    focused.current = true;
    (canShare ? shareRef : copyRef).current?.focus();
  }, [canShare]);

  const toSend = withLink(message, url);
  const mailto = `mailto:?subject=${encodeURIComponent(title.trim())}&body=${encodeURIComponent(toSend)}`;

  async function share() {
    try {
      // The link goes in the text, not as `url` too, or many apps paste it twice.
      await navigator.share({ title: title.trim(), text: toSend });
    } catch {
      // Closing the menu without sending rejects with AbortError, and a
      // refused share rejects too. Neither sent anything.
      return;
    }
    setShared(true);
  }

  const lead = firstTime ? LEAD_FIRST_TIME : LEAD_LATER[variant];
  const phone = variant === 'phone';
  const messageAction = `${SECONDARY} ${phone ? 'h-11 px-4 text-[15px]' : 'h-[34px] px-3 text-[13px]'}`;

  const copyLinkButton = (
    <button
      ref={copyRef}
      type="button"
      onClick={() => void link.copy(url)}
      className={
        phone
          ? `${PHONE_BUTTON} h-12 flex-1 basis-0 text-[15px] ${canShare ? PHONE_SECONDARY : PHONE_PRIMARY}`
          : `${DESKTOP_PRIMARY} min-w-[112px] shrink-0`
      }
    >
      {link.copied ? (
        <Check size={phone ? 16 : 14} strokeWidth={2.6} aria-hidden="true" />
      ) : (
        <Copy size={phone ? 16 : 14} aria-hidden="true" />
      )}
      {link.copied ? 'Copied' : 'Copy link'}
    </button>
  );

  const messageBox = (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={messageId} className="text-[13px] font-semibold text-ink">
        {phone ? 'The message that goes with it' : 'A message to send with it'}
      </label>
      <textarea
        id={messageId}
        rows={phone ? 6 : 5}
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        className={`w-full rounded-[10px] border border-surface-sunk bg-white px-3 py-2 leading-normal text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand ${
          phone ? 'resize-none text-base' : 'resize-y text-[13px]'
        }`}
      />
      {canShare ? null : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void messageCopy.copy(toSend)}
            className={messageAction}
          >
            {messageCopy.copied ? <Check size={14} strokeWidth={2.6} aria-hidden="true" /> : null}
            {messageCopy.copied ? 'Copied' : 'Copy message'}
          </button>
          <a href={mailto} className={messageAction}>
            <Mail size={14} aria-hidden="true" />
            Email it
          </a>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3.5">
      {phone ? null : (
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            {firstTime ? <PublishedMark /> : null}
            <h2 id={headingId} className="text-base font-semibold tracking-tight text-ink">
              {shareHeading(firstTime)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-raised"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <p className={`leading-snug text-ink-muted ${phone ? 'text-sm' : 'text-[13px]'}`}>{lead}</p>

      {phone ? (
        <>
          {canShare ? (
            <div className="flex flex-col gap-1.5">
              <button
                ref={shareRef}
                type="button"
                onClick={() => void share()}
                className={`${PHONE_BUTTON} h-[52px] text-base ${PHONE_PRIMARY}`}
              >
                <Share size={17} aria-hidden="true" />
                Share…
              </button>
              <p aria-live="polite" className="text-balance text-center text-[13px] text-ink-muted">
                {shared
                  ? 'Sent from your phone’s share menu.'
                  : 'Opens your phone’s share menu, with the message and link.'}
              </p>
            </div>
          ) : null}
          <div className="flex gap-2">
            {copyLinkButton}
            <ShareQrCode url={url} variant="phone" />
          </div>
          {messageBox}
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <label htmlFor={linkId} className="sr-only">
              Public link
            </label>
            <input
              id={linkId}
              type="text"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 min-w-0 flex-1 rounded-[10px] border border-surface-sunk bg-surface-raised px-3 font-mono text-[12.5px] text-ink"
            />
            {copyLinkButton}
          </div>
          {messageBox}
          <ShareQrCode url={url} variant="desktop" />
        </>
      )}

      <span className="sr-only" aria-live="polite">
        {link.copied ? 'Link copied' : messageCopy.copied ? 'Message copied' : ''}
      </span>
    </div>
  );
}

const DESKTOP_PRIMARY =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-brand px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110';

// Copy message and Email it.
const SECONDARY =
  'inline-flex items-center gap-1.5 rounded-[10px] border border-surface-sunk bg-white font-semibold text-ink transition hover:bg-surface-raised';

const PHONE_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-[12px] font-semibold transition';

const PHONE_PRIMARY = 'bg-brand text-white hover:brightness-110';

const PHONE_SECONDARY = 'border border-surface-sunk bg-white text-ink hover:bg-surface-raised';
