'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import { QrCode } from 'lucide-react';
import { correction, generate, type Bitmap2D } from 'lean-qr/nano';
import { QR_QUIET_ZONE, qrFileName, qrPngScale, qrSide, qrSvgPath } from '@/lib/qr';
import { emitSignupLinkEvent } from '@/lib/signup-link-events';

/** The downloaded picture is at least this many pixels wide, enough for print. */
const PNG_MIN_PX = 1024;

type Qr = { code: Bitmap2D; side: number; path: string };

/**
 * The code, margin included, black on white, as a PNG data URL; null where
 * the browser can't draw one (no canvas, or a canvas it won't read back).
 * The encoder paints one pixel per module, which is then scaled up with no
 * smoothing so the edges stay sharp.
 */
function toPngDataUrl(code: Bitmap2D): string | null {
  try {
    const small = document.createElement('canvas');
    code.toCanvas(small, { pad: QR_QUIET_ZONE, on: [0, 0, 0, 255], off: [255, 255, 255, 255] });
    const big = document.createElement('canvas');
    big.width = big.height = qrSide(code) * qrPngScale(code, PNG_MIN_PX);
    const ctx = big.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, big.width, big.height);
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
 * on a computer a row with a small preview and Download, on a phone a
 * QR code button beside Copy link. The browser draws both itself, so
 * nothing goes to an outside service, and the PNG only when the download
 * is chosen. The encoder (`lean-qr/nano`, 2 kB) comes in the panel's own
 * code, which loads only when the panel opens, so it's never in a page's
 * first load and the code is there as soon as the panel is: nothing to
 * wait for, and nothing moves.
 *
 * Where the browser can't draw the PNG, there's no QR code, rather than a
 * Download that does nothing; one that fails when chosen goes away. The
 * panel goes on without it.
 */
export function ShareQrCode({
  signupId,
  url,
  variant,
}: {
  /** The signup the link is for, so a download is recorded against it. */
  signupId: string;
  url: string;
  variant: 'desktop' | 'phone';
}) {
  // Rendered only in the browser: the panel never renders on the server.
  const qr = useMemo(() => makeQr(url), [url]);
  const [refused, setRefused] = useState(false);
  if (!qr || refused) return null;
  const { code, side, path } = qr;

  function download(e: MouseEvent<HTMLAnchorElement>) {
    // Set before the browser follows the link, which it does after this
    // handler returns, so the click that asked for it saves it. A canvas
    // that wouldn't give the picture back takes the QR code away.
    const png = toPngDataUrl(code);
    if (png) {
      e.currentTarget.href = png;
      emitSignupLinkEvent(signupId, 'shared', 'qr_code');
    } else {
      e.preventDefault();
      setRefused(true);
    }
  }

  const phone = variant === 'phone';
  const link = (
    <a
      href="#"
      download={qrFileName(url)}
      onClick={download}
      aria-label="Download QR code"
      className={phone ? PHONE_BUTTON_CLASS : DESKTOP_LINK_CLASS}
    >
      {phone ? <QrCode size={16} aria-hidden="true" /> : null}
      {phone ? 'QR code' : 'Download'}
    </a>
  );

  if (phone) return link;

  return (
    <div className="flex items-center gap-3 border-t border-surface-sunk pt-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-surface-sunk bg-white">
        <svg
          viewBox={`0 0 ${side} ${side}`}
          width={42}
          height={42}
          role="img"
          aria-label="QR code for the link"
          shapeRendering="crispEdges"
        >
          <rect width={side} height={side} fill="#ffffff" />
          <path d={path} fill="#000000" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink-muted">
        A QR code for a flyer or a sign-up table.
      </span>
      {link}
    </div>
  );
}

// The same height as Copy message and Email it, so its focus ring has room;
// the negative margin keeps the word at the panel's edge.
const DESKTOP_LINK_CLASS =
  '-mr-2.5 inline-flex h-[34px] shrink-0 items-center rounded-[10px] px-2.5 text-[13px] font-semibold text-brand hover:underline';

// Beside Copy link, and drawn the same way.
const PHONE_BUTTON_CLASS =
  'inline-flex h-12 flex-1 basis-0 items-center justify-center gap-2 rounded-[12px] border border-surface-sunk bg-white text-[15px] font-semibold text-ink transition hover:bg-surface-raised';
