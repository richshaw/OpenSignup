'use client';

import { useEffect, useLayoutEffect, useId, useRef, useState, type Ref } from 'react';
import { Check, Copy, Mail, Share } from 'lucide-react';
import { useClipboardCopy } from '@/hooks/useClipboardCopy';
import { emailBody, withLink } from '@/lib/share-message';
import { emitSignupLinkEvent } from '@/lib/signup-link-events';
import { ShareQrCode } from './ShareQrCode';

export interface SharePanelProps {
  /** A popover by the header's button on a computer, a sheet on a phone. */
  variant: 'desktop' | 'phone';
  /** Just published: says that nobody has the link yet. */
  firstTime: boolean;
  /** The signup the link is for, so a copy or a share is recorded against it. */
  signupId: string;
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
}

const LEAD_FIRST_TIME = 'Anyone with the link can sign up. Nobody has it until you send it.';
const LEAD_LATER = {
  desktop: 'Send it by email or in a group chat. Anyone with the link can sign up.',
  phone: 'Send it to a group chat, by text or by email. Anyone with the link can sign up.',
} as const;

const LINK_COPY_REFUSED = 'Couldn’t copy. Select the link and copy it.';
const MESSAGE_COPY_REFUSED = 'Couldn’t copy. Select the message and copy it.';

type Copied = 'link' | 'message';

/**
 * Ways to send a published signup's link: copy it, copy or email a message
 * with it, a QR code, and on a phone the phone's own share menu. The sending
 * happens in the browser or the organizer's own apps. Each copy or share
 * that worked is recorded (`emitSignupLinkEvent`): which button, and nothing
 * about the message or who it went to. Loaded only when it opens.
 *
 * The heading, "Published" and the ✕ are the container's (`ShareButton`),
 * so the popover or sheet is named and can be closed while this loads.
 *
 * Focus goes to the first way to send it: Copy link, or Share… where the
 * phone has a share menu. Each copy is announced; a copy the clipboard
 * refuses says so and selects what to copy by hand.
 */
export function SharePanel({
  variant,
  firstTime,
  signupId,
  title,
  url,
  message,
  onMessageChange,
}: SharePanelProps) {
  const link = useClipboardCopy();
  const messageCopy = useClipboardCopy();
  // Whether to offer Share…: only on a phone that has a share menu. Decided
  // after mount, so a server render and the first client render agree, but
  // before paint, so the buttons don't move once they're seen.
  const [canShare, setCanShare] = useState<boolean | null>(variant === 'phone' ? null : false);
  const [shared, setShared] = useState(false);
  // The last copy that worked, which the live region says while its button
  // says Copied; or the last that the clipboard refused, which shows until
  // a copy works. `n` makes each refusal select again.
  const [lastCopied, setLastCopied] = useState<Copied | null>(null);
  const [refused, setRefused] = useState<{ what: Copied; n: number } | null>(null);
  const messageId = useId();
  const copyRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const linkField = useRef<HTMLInputElement>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);
  const focused = useRef(false);

  useLayoutEffect(() => {
    if (variant === 'phone') setCanShare(typeof navigator.share === 'function');
  }, [variant]);

  // The computer's box fits the message as it changes, before it's seen,
  // until the organizer drags its corner: then the size they chose stays.
  const fitted = useRef<string | null>(null);
  useLayoutEffect(() => {
    const box = messageField.current;
    if (variant === 'phone' || !box) return;
    if (fitted.current !== null && box.style.height !== fitted.current) return;
    fitted.current = fitToMessage(box);
  }, [variant, message]);

  useEffect(() => {
    if (canShare === null || focused.current) return;
    focused.current = true;
    (canShare ? shareRef : copyRef).current?.focus();
  }, [canShare]);

  useEffect(() => {
    if (!refused) return;
    const field = refused.what === 'link' ? linkField.current : messageField.current;
    field?.focus();
    field?.select();
  }, [refused]);

  const toSend = withLink(message, url);
  const mailto = `mailto:?subject=${encodeURIComponent(title.trim())}&body=${encodeURIComponent(
    emailBody(message, title, url),
  )}`;

  async function copy(what: Copied) {
    const worked = await (what === 'link' ? link.copy(url) : messageCopy.copy(toSend));
    if (worked) {
      setRefused(null);
      setLastCopied(what);
      emitSignupLinkEvent(signupId, 'copied', what === 'link' ? 'share_panel' : 'share_message');
    } else {
      setLastCopied(null);
      setRefused((was) => ({ what, n: (was?.n ?? 0) + 1 }));
    }
  }

  async function share() {
    try {
      // The link goes in the text, not as `url` too, or many apps paste it twice.
      await navigator.share({ title: title.trim(), text: toSend });
    } catch {
      // Closing the menu without sending rejects with AbortError, and a
      // refused share rejects too. Neither sent anything, so neither counts.
      return;
    }
    setShared(true);
    emitSignupLinkEvent(signupId, 'shared', 'share_menu');
  }

  const lead = firstTime ? LEAD_FIRST_TIME : LEAD_LATER[variant];
  const phone = variant === 'phone';
  // On a computer, as wide as "Copy message" at its widest, so its "Copied"
  // doesn't move Email it beside it. On a phone, half the row each, lined up
  // with Copy link and QR code above, which keeps them still too.
  const messageAction = `${SECONDARY} ${
    phone ? 'h-11 px-4 text-[15px]' : 'h-[34px] min-w-[124px] px-3 text-[13px]'
  }`;
  const copiedNow =
    lastCopied === 'link' && link.copied
      ? 'Link copied'
      : lastCopied === 'message' && messageCopy.copied
        ? 'Message copied'
        : '';

  const copyLinkButton = (
    <button
      ref={copyRef}
      type="button"
      onClick={() => void copy('link')}
      className={
        phone
          ? `${PHONE_BUTTON} h-12 text-[15px] ${canShare ? PHONE_SECONDARY : PHONE_PRIMARY}`
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
        A message to send with it
      </label>
      <textarea
        ref={messageField}
        id={messageId}
        rows={phone ? PHONE_ROWS : MIN_ROWS}
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        className={`w-full rounded-[10px] border border-surface-sunk bg-white px-3 py-2 leading-normal text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand ${
          phone ? 'resize-none text-base' : 'resize-y text-[13px]'
        }`}
      />
      {canShare ? null : (
        <div className={phone ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
          <button type="button" onClick={() => void copy('message')} className={messageAction}>
            {messageCopy.copied ? <Check size={14} strokeWidth={2.6} aria-hidden="true" /> : null}
            {messageCopy.copied ? 'Copied' : 'Copy message'}
          </button>
          <a
            href={mailto}
            // Counted on the click: what happens in the email app isn't ours to see.
            onClick={() => emitSignupLinkEvent(signupId, 'shared', 'email')}
            className={messageAction}
          >
            <Mail size={14} aria-hidden="true" />
            Email it
          </a>
        </div>
      )}
      {canShare ? null : (
        <p aria-live="polite" className={refused?.what === 'message' ? REFUSED : 'sr-only'}>
          {refused?.what === 'message' ? MESSAGE_COPY_REFUSED : ''}
        </p>
      )}
    </div>
  );

  // Under the link's row: a refused copy of the link, seen, or else the last
  // copy that worked, link or message, unseen. A refused copy of the message
  // shows under its own row, above.
  const linkNotice = (
    <p aria-live="polite" className={refused?.what === 'link' ? REFUSED : 'sr-only'}>
      {refused?.what === 'link' ? LINK_COPY_REFUSED : refused ? '' : copiedNow}
    </p>
  );

  return (
    <div className="flex flex-col gap-3.5">
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
          <div className="flex flex-col gap-2">
            {/* The link to copy by hand, and why, once the clipboard has
                refused it. */}
            {refused?.what === 'link' ? (
              <div className="flex">
                <LinkField url={url} ref={linkField} />
              </div>
            ) : null}
            {linkNotice}
            {/* Half the row each, as Copy message and Email it are below,
                so the two rows line up; the QR code shows large across both
                columns, under these. */}
            <div className="grid grid-cols-2 gap-2">
              {copyLinkButton}
              <ShareQrCode signupId={signupId} title={title} url={url} variant="phone" />
            </div>
          </div>
          {messageBox}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <LinkField url={url} ref={linkField} />
              {copyLinkButton}
            </div>
            {linkNotice}
          </div>
          {messageBox}
          <ShareQrCode signupId={signupId} title={title} url={url} variant="desktop" />
        </>
      )}
    </div>
  );
}

/**
 * The public link in a read-only box, selected whole when it gets focus, so
 * it can be copied by hand where the clipboard refuses.
 */
function LinkField({ url, ref }: { url: string; ref: Ref<HTMLInputElement> }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Public link
      </label>
      <input
        ref={ref}
        id={id}
        type="text"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="h-10 min-w-0 flex-1 rounded-[10px] border border-surface-sunk bg-surface-raised px-3 font-mono text-[12.5px] text-ink"
      />
    </>
  );
}

// The message box's rows: on a phone, where the sheet scrolls, one size; on
// a computer, where it fits the message (see `fitToMessage`), the fewest.
const PHONE_ROWS = 6;
const MIN_ROWS = 5;
const MAX_ROWS = 12;

/**
 * Makes the computer's message box as tall as the message, from 5 rows (its
 * `rows`) to 12, so a message of up to 10 lines shows whole however wide
 * its text runs: the browser's own measure of it (`scrollHeight`), not a
 * guess at characters a row, which wide letters such as Chinese outran.
 * Returns the height it set.
 */
function fitToMessage(box: HTMLTextAreaElement): string {
  const style = getComputedStyle(box);
  const px = (value: string) => parseFloat(value) || 0;
  const frame = px(style.borderTopWidth) + px(style.borderBottomWidth);
  const line = parseFloat(style.lineHeight);
  const most = Number.isFinite(line)
    ? MAX_ROWS * line + px(style.paddingTop) + px(style.paddingBottom) + frame
    : Infinity;
  // Back to its rows first, so it can shrink as well as grow.
  box.style.height = '';
  const height = `${Math.min(box.scrollHeight + frame, most)}px`;
  box.style.height = height;
  return height;
}

const DESKTOP_PRIMARY =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-brand px-4 text-[13.5px] font-semibold text-white transition hover:brightness-110';

// Copy message and Email it.
const SECONDARY =
  'inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-surface-sunk bg-white font-semibold text-ink transition hover:bg-surface-raised';

// A refused copy's line, under the row of the button that was refused.
const REFUSED = 'text-[13px] font-medium leading-snug text-danger';

const PHONE_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-[12px] font-semibold transition';

const PHONE_PRIMARY = 'bg-brand text-white hover:brightness-110';

const PHONE_SECONDARY = 'border border-surface-sunk bg-white text-ink hover:bg-surface-raised';
