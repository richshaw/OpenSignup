/**
 * Drawing a QR code that the browser made itself, with no outside service:
 * the share panel's preview (an SVG path) and the layout and name of its
 * picture (a PNG drawn on a canvas, the signup's title under the code).
 * These helpers only read the encoder's module grid and take the canvas's
 * text measuring as an argument, so they stay pure and testable without
 * either.
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

/**
 * Where the picture's parts go, in pixels: the code with its margin, a
 * square as wide as the picture, and the title's lines under it.
 */
export interface QrPngLayout {
  /** Pixels per module. */
  scale: number;
  width: number;
  height: number;
  /** The title's size; its lines are centred on `width / 2`. */
  fontPx: number;
  /** At most two lines, the last ending in `…` if the title went on. */
  lines: { text: string; middle: number }[];
  /** The way the title reads, for every line (see `textDirection`). */
  direction: 'ltr' | 'rtl';
}

/** The title's lines, at most this many. */
const TITLE_LINES = 2;

/**
 * Lays the picture out for `title`, at least `minPx` wide: whole pixels per
 * module, so the code's edges stay sharp, and the title in lines no wider
 * than the code itself. The title's size is a twentieth of the width, about
 * 9pt where the picture prints 2½ inches wide. Below the code's own margin,
 * which scanners need clear, the title gets the same margin again under it,
 * so the picture has a white border all round. No title, and the picture
 * is the square code alone.
 *
 * `measure(text, fontPx)` is the width the text would be drawn at that
 * size: the canvas's `measureText`.
 */
export function qrPngLayout(
  code: QrModules,
  title: string,
  measure: (text: string, fontPx: number) => number,
  minPx: number,
): QrPngLayout {
  const scale = Math.ceil(minPx / qrSide(code));
  const width = qrSide(code) * scale;
  const margin = QR_QUIET_ZONE * scale;
  const fontPx = Math.round(width / 20);
  const lineHeight = Math.round(fontPx * 1.25);
  const lines = wrap(title, width - 2 * margin, (text) => measure(text, fontPx));
  return {
    scale,
    width,
    height: lines.length === 0 ? width : width + lines.length * lineHeight + margin,
    fontPx,
    lines: lines.map((text, i) => ({ text, middle: width + i * lineHeight + lineHeight / 2 })),
    direction: textDirection(title),
  };
}

/** Letters of the scripts written right to left. */
const RTL_LETTER =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}]/u;

/**
 * The way `text` reads, from its first letter, as the bidi algorithm takes
 * a paragraph's direction from its first strong character: digits, spaces
 * and punctuation don't decide it. Taken once for the whole title, so a
 * line of a Hebrew title that starts with a Latin word ("Zoom") still reads
 * right to left, with its "…" at its end, on the left.
 */
export function textDirection(text: string): 'ltr' | 'rtl' {
  const first = /\p{L}/u.exec(text)?.[0];
  return first !== undefined && RTL_LETTER.test(first) ? 'rtl' : 'ltr';
}

/**
 * `text` in lines no wider than `maxWidth`, broken between words, or inside
 * a word too long for a line of its own (or a title in a script written
 * without spaces), between whole characters. Past `TITLE_LINES`, the last
 * line kept ends in `…`.
 */
function wrap(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const joined = line ? `${line} ${word}` : word;
    if (measure(joined) <= maxWidth) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    if (measure(word) <= maxWidth) {
      line = word;
      continue;
    }
    line = '';
    for (const char of graphemes(word)) {
      if (line && measure(line + char) > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= TITLE_LINES) return lines;

  const cut = graphemes(lines[TITLE_LINES - 1]!);
  const ending = () => `${cut.join('').trimEnd()}…`;
  while (cut.length > 0 && measure(ending()) > maxWidth) cut.pop();
  return [...lines.slice(0, TITLE_LINES - 1), ending()];
}

/**
 * `text`'s characters as a reader sees them, so a break or a cut never
 * splits an emoji made of several (a family, a flag) or a letter and its
 * accent. Code points where the browser has no `Intl.Segmenter`.
 */
function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== 'function') return Array.from(text);
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

let segmenter: Intl.Segmenter | undefined;

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
