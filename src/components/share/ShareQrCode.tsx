'use client';

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Check, Download, QrCode } from 'lucide-react';
import { correction, generate, type Bitmap2D } from 'lean-qr/nano';
import { QR_QUIET_ZONE, qrFileName, qrPngLayout, qrSide, qrSvgPath } from '@/lib/qr';
import { emitSignupLinkEvent } from '@/lib/signup-link-events';

/** The downloaded picture is at least this many pixels wide, enough for print. */
const PNG_MIN_PX = 1024;

/** The title's font in the picture: a plain sans-serif every system has. */
const titleFont = (px: number) =>
  `600 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

type Qr = { code: Bitmap2D; side: number; path: string };

/**
 * The code, margin included, black on white, with the signup's title
 * centred under it (see `qrPngLayout`), as a PNG data URL; null where the
 * browser can't draw one (no canvas, or a canvas it won't read back). The
 * encoder paints one pixel per module, which is then scaled up with no
 * smoothing so the edges stay sharp.
 */
function toPngDataUrl(code: Bitmap2D, title: string): string | null {
  try {
    const small = document.createElement('canvas');
    code.toCanvas(small, { pad: QR_QUIET_ZONE, on: [0, 0, 0, 255], off: [255, 255, 255, 255] });
    const big = document.createElement('canvas');
    const ctx = big.getContext('2d');
    if (!ctx) return null;
    const layout = qrPngLayout(
      code,
      title,
      (text, px) => {
        ctx.font = titleFont(px);
        return ctx.measureText(text).width;
      },
      PNG_MIN_PX,
    );
    // Sizing the canvas clears it and resets the context's settings.
    big.width = layout.width;
    big.height = layout.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, layout.width, layout.width);
    ctx.fillStyle = '#000000';
    ctx.font = titleFont(layout.fontPx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Each line is isolated in the title's direction (U+2067 right to left,
    // U+2066 left to right, … U+2069) rather than the page's, so a
    // right-to-left title keeps its "…" at its end, on the left, even on a
    // line that starts with a Latin word. The marks have no width, so the
    // layout measures the line without them.
    const isolate = layout.direction === 'rtl' ? '\u2067' : '\u2066';
    for (const line of layout.lines) {
      ctx.fillText(`${isolate}${line.text}\u2069`, layout.width / 2, line.middle);
    }
    return big.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * The link's QR code, or null where there'd be nothing to save: a browser
 * with no canvas to draw the PNG on, or an encoder that fails.
 */
function makeQr(url: string): Qr | null {
  try {
    if (document.createElement('canvas').getContext('2d') === null) return null;
    const code = generate(url, { minCorrectionLevel: correction.M });
    return { code, side: qrSide(code), path: qrSvgPath(code) };
  } catch {
    return null;
  }
}

/**
 * The share panel's QR code, to print on a flyer or put on a sign-up table:
 * on a computer a row with a small preview and Download; on a phone a
 * QR code button beside Copy link, which shows the code large in the sheet
 * with Save image under it. The browser draws it itself, so nothing goes to
 * an outside service, and the PNG only when it's saved. The encoder
 * (`lean-qr/nano`, 2 kB) comes in the panel's own code, which loads after
 * the page does, so it's never in a page's first load, and the code is
 * there as soon as the panel is: nothing to wait for, and nothing moves.
 *
 * Where the browser can't draw the PNG, there's no QR code, rather than a
 * Download that does nothing; one that fails when chosen goes away. The
 * panel goes on without it.
 *
 * Its use is recorded once each time the panel opens, when the code is
 * first shown large or first saved or downloaded: one more look at it, or
 * a second copy, isn't another share.
 */
export function ShareQrCode({
  signupId,
  title,
  url,
  variant,
}: {
  /** The signup the link is for, so its use is recorded against it. */
  signupId: string;
  /** The signup's title, printed under the code in the picture. */
  title: string;
  url: string;
  variant: 'desktop' | 'phone';
}) {
  // Rendered only in the browser: the panel never renders on the server.
  const qr = useMemo(() => makeQr(url), [url]);
  const [refused, setRefused] = useState(false);
  const [shown, setShown] = useState(false);
  const [saved, setSaved] = useState(false);
  const recorded = useRef(false);
  // While the phone's share menu is open: a second tap on Save image then
  // would be refused, and must not fall through to a download.
  const sharing = useRef(false);
  const largeId = useId();

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  if (!qr || refused) return null;
  const { code, side, path } = qr;
  const name = qrFileName(url);
  const alt = `QR code for the sign-up link to ${title.trim()}`;

  function record() {
    if (recorded.current) return;
    recorded.current = true;
    emitSignupLinkEvent(signupId, 'shared', 'qr_code');
  }

  /** The picture, or null having taken the QR code away. */
  function picture(): string | null {
    const png = toPngDataUrl(code, title);
    if (!png) setRefused(true);
    return png;
  }

  function download(e: MouseEvent<HTMLAnchorElement>) {
    // Set before the browser follows the link, which it does after this
    // handler returns, so the click that asked for it saves it.
    const png = picture();
    if (png) {
      e.currentTarget.href = png;
      record();
    } else {
      e.preventDefault();
    }
  }

  async function save() {
    if (sharing.current) return;
    const png = picture();
    if (!png) return;
    record();
    // A phone that can share a file offers its own Save Image (and the
    // apps it could go to); elsewhere it downloads. The file is made from
    // the data URL there and then, as sharing must start in the tap.
    const file = new File([pngBytes(png)], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      sharing.current = true;
      try {
        await navigator.share({ files: [file] });
        // Saved, or sent to another app: the phone's own menu has said
        // which, and "Saved" here might not be true.
        return;
      } catch (err) {
        // Closed without saving, or a menu already open: nothing to say.
        // Refused: download instead.
        if (err instanceof DOMException && QUIET_SHARE_ERRORS.includes(err.name)) return;
      } finally {
        sharing.current = false;
      }
    }
    downloadFile(png, name);
    setSaved(true);
  }

  if (variant === 'phone') {
    return (
      <>
        {/* Focus stays here: a screen reader hears "Hide QR code,
            expanded", then the code's name and Save image. While the code
            shows, the button looks pressed and says Hide QR code, since
            the code pushes the message below the screen and one tap brings
            it back. It's a grid column either way, so the row doesn't move. */}
        <button
          type="button"
          aria-expanded={shown}
          aria-controls={shown ? largeId : undefined}
          onClick={() => {
            if (!shown) record();
            setShown(!shown);
          }}
          className={`${PHONE_BUTTON_CLASS} ${shown ? PHONE_BUTTON_OPEN : PHONE_BUTTON_CLOSED}`}
        >
          <QrCode size={16} aria-hidden="true" className={shown ? 'text-brand' : undefined} />
          {shown ? 'Hide QR code' : 'QR code'}
        </button>
        {shown ? (
          <div id={largeId} className="col-span-2 flex flex-col items-center gap-3 pt-1">
            <svg
              viewBox={`0 0 ${side} ${side}`}
              role="img"
              aria-label={alt}
              shapeRendering="crispEdges"
              className="aspect-square w-full max-w-[280px] rounded-[12px] border border-surface-sunk"
            >
              <rect width={side} height={side} fill="#ffffff" />
              <path d={path} fill="#000000" />
            </svg>
            <button
              type="button"
              onClick={() => void save()}
              className={`${PHONE_SAVE_CLASS} w-full max-w-[280px]`}
            >
              {saved ? (
                <Check size={16} strokeWidth={2.6} aria-hidden="true" />
              ) : (
                <Download size={16} aria-hidden="true" />
              )}
              {saved ? 'Saved' : 'Save image'}
            </button>
            <p aria-live="polite" className="sr-only">
              {saved ? 'QR code saved' : ''}
            </p>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex items-center gap-3 border-t border-surface-sunk pt-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-surface-sunk bg-white">
        <svg
          viewBox={`0 0 ${side} ${side}`}
          width={42}
          height={42}
          role="img"
          aria-label={alt}
          shapeRendering="crispEdges"
        >
          <rect width={side} height={side} fill="#ffffff" />
          <path d={path} fill="#000000" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink-muted">
        A QR code for a flyer or a sign-up table.
      </span>
      <a
        href="#"
        download={name}
        onClick={download}
        aria-label="Download QR code"
        className={DESKTOP_LINK_CLASS}
      >
        Download
      </a>
    </div>
  );
}

/**
 * A share that rejects with one of these sent nothing and needs no
 * download: the menu was closed (AbortError), or one was already open
 * (InvalidStateError).
 */
const QUIET_SHARE_ERRORS = ['AbortError', 'InvalidStateError'];

/** A data URL's bytes. */
function pngBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Saves `href` as a file called `name`, as a download link would. */
function downloadFile(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

// The same height as Copy message and Email it, so its focus ring has room;
// the negative margin keeps the word at the panel's edge.
const DESKTOP_LINK_CLASS =
  '-mr-2.5 inline-flex h-[34px] shrink-0 items-center rounded-[10px] px-2.5 text-[13px] font-semibold text-brand hover:underline';

// Beside Copy link, and drawn the same way; while the code shows, in the
// app's pressed look, a brand border on a brand tint (as the Build tab's
// Fields button has while open), with ink text, since brand on the tint is
// under 4.5:1 at this size.
const PHONE_BUTTON_CLASS =
  'inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border text-[15px] font-semibold text-ink transition';
const PHONE_BUTTON_CLOSED = 'border-surface-sunk bg-white hover:bg-surface-raised';
const PHONE_BUTTON_OPEN = 'border-brand bg-brand-soft';

// Under the large code, as wide as it, so Saved doesn't change its size.
const PHONE_SAVE_CLASS =
  'inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-surface-sunk bg-white text-[15px] font-semibold text-ink transition hover:bg-surface-raised';
