/**
 * Drawing a QR code that the browser made itself, with no outside service:
 * the share panel's preview (an SVG path) and the size and name of its
 * download (a PNG the encoder draws on a canvas). The encoder is loaded on
 * demand; these helpers only read its module grid, so they stay small and
 * testable without it.
 */

/** A QR code's square grid of modules, as `lean-qr` returns it. */
export interface QrModules {
  readonly size: number;
  /** Whether the module in column `x`, row `y` is dark. */
  get(x: number, y: number): boolean;
}

/** The blank margin, in modules, that scanners need around the code. */
export const QR_QUIET_ZONE = 4;

/** A run of dark modules on one row, in the grid with its margin. */
interface QrRun {
  x: number;
  y: number;
  length: number;
}

/** The side of the code with its margin, in modules. */
export function qrSide(code: QrModules): number {
  return code.size + 2 * QR_QUIET_ZONE;
}

/** Every row's dark modules, joined into runs, offset by the margin. */
export function qrRuns(code: QrModules): QrRun[] {
  const runs: QrRun[] = [];
  for (let y = 0; y < code.size; y++) {
    let start = -1;
    for (let x = 0; x <= code.size; x++) {
      const dark = x < code.size && code.get(x, y);
      if (dark && start < 0) start = x;
      if (!dark && start >= 0) {
        runs.push({ x: start + QR_QUIET_ZONE, y: y + QR_QUIET_ZONE, length: x - start });
        start = -1;
      }
    }
  }
  return runs;
}

/**
 * One SVG path for every dark module, in a `0 0 side side` view box (see
 * `qrSide`). Each run is a rectangle one module high.
 */
export function qrSvgPath(code: QrModules): string {
  return qrRuns(code)
    .map(({ x, y, length }) => `M${x} ${y}h${length}v1h-${length}z`)
    .join('');
}

/** Whole pixels per module, so the downloaded picture is at least `minPx` wide. */
export function qrPngScale(code: QrModules, minPx: number): number {
  return Math.ceil(minPx / qrSide(code));
}

/**
 * The downloaded picture's name, from the link's last path segment (the
 * signup's slug): `book-fair-k3x-qr.png`.
 */
export function qrFileName(url: string): string {
  const slug = url
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .pop();
  return `${slug || 'signup'}-qr.png`;
}
