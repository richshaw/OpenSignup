import { describe, expect, it } from 'vitest';
import { correction, generate } from 'lean-qr/nano';
import {
  QR_QUIET_ZONE,
  qrFileName,
  qrPngLayout,
  qrRuns,
  textDirection,
  qrSide,
  qrSvgPath,
  type QrModules,
} from './qr';

/** A grid from rows of `#` (dark) and `.` (light). */
function grid(...rows: string[]): QrModules {
  return { size: rows.length, get: (x, y) => rows[y]?.[x] === '#' };
}

const Q = QR_QUIET_ZONE;

describe('qrRuns', () => {
  it('joins neighbouring dark modules on a row, and offsets them by the margin', () => {
    expect(qrRuns(grid('##.', '.#.', '###'))).toEqual([
      { x: Q, y: Q, length: 2 },
      { x: Q + 1, y: Q + 1, length: 1 },
      { x: Q, y: Q + 2, length: 3 },
    ]);
  });

  it('closes a run at the end of its row rather than carrying it to the next', () => {
    expect(qrRuns(grid('.#', '#.'))).toEqual([
      { x: Q + 1, y: Q, length: 1 },
      { x: Q, y: Q + 1, length: 1 },
    ]);
  });

  it('has nothing to draw for an all-light grid', () => {
    expect(qrRuns(grid('..', '..'))).toEqual([]);
  });
});

describe('qrSvgPath', () => {
  it('draws each run as a rectangle one module high', () => {
    expect(qrSvgPath(grid('##.', '..#', '...'))).toBe(
      `M${Q} ${Q}h2v1h-2zM${Q + 2} ${Q + 1}h1v1h-1z`,
    );
  });
});

describe('qrSide and qrPngLayout', () => {
  // The smallest QR code is 21 modules a side; 29 with its margin.
  const smallest = grid(...Array.from({ length: 21 }, () => '.'.repeat(21)));
  // Each character half as wide as the font is tall: at 51px, 28 fit in the
  // 735px between the margins.
  const measure = (text: string, fontPx: number) => (Array.from(text).length * fontPx) / 2;
  const layout = (title: string) => qrPngLayout(smallest, title, measure, 1000);
  const fits = (text: string) => measure(text, 51) <= 1015 - 2 * 4 * 35;

  it('adds the margin to both sides', () => {
    expect(qrSide(smallest)).toBe(21 + 2 * Q);
  });

  it('picks whole pixels per module, enough to reach the width asked for', () => {
    const { scale, width } = layout('');
    expect(scale).toBe(35);
    expect(width).toBe(35 * qrSide(smallest));
    expect(width).toBeGreaterThanOrEqual(1000);
    expect((scale - 1) * qrSide(smallest)).toBeLessThan(1000);
  });

  it('is the square code alone when there is no title', () => {
    expect(layout('')).toEqual({
      scale: 35,
      width: 1015,
      height: 1015,
      fontPx: 51,
      lines: [],
      direction: 'ltr',
    });
    expect(layout('  \n ').lines).toEqual([]);
  });

  it('puts the title under the code’s margin, at a twentieth of the width', () => {
    const { width, height, fontPx, lines } = layout('  Bake sale helpers ');
    expect(fontPx).toBe(Math.round(width / 20));
    // One line, 64px high, below the code and its margin, with the margin
    // again under it.
    expect(lines).toEqual([{ text: 'Bake sale helpers', middle: width + 32 }]);
    expect(height).toBe(width + 64 + 4 * 35);
  });

  it('breaks a long title between words, no line wider than the code', () => {
    const { width, height, lines } = layout('Snack duty for the spring season at the park');
    expect(lines).toEqual([
      { text: 'Snack duty for the spring', middle: width + 32 },
      { text: 'season at the park', middle: width + 96 },
    ]);
    expect(height).toBe(width + 2 * 64 + 4 * 35);
  });

  it('stops at two lines, the second ending in an ellipsis', () => {
    const { lines } = layout(
      'Volunteers for the school book fair, setting up, selling and packing away on Saturday',
    );
    expect(lines.map((l) => l.text)).toEqual([
      'Volunteers for the school',
      'book fair, setting up,…',
    ]);
    // A word cut to fit keeps what fits beside the ellipsis.
    const longer = layout('Volunteers for the school bookfairsettingupsellingandpacking away');
    expect(longer.lines.map((l) => l.text)).toEqual([
      'Volunteers for the school',
      'bookfairsettingupsellingand…',
    ]);
    for (const { text } of longer.lines) expect(fits(text)).toBe(true);
  });

  it('breaks inside a word too long for a line, or a title written without spaces', () => {
    expect(layout('x'.repeat(40)).lines.map((l) => l.text)).toEqual([
      'x'.repeat(28),
      'x'.repeat(12),
    ]);
    const title = '春の読書会のボランティア募集です。'.repeat(2);
    expect(layout(title).lines.map((l) => l.text)).toEqual([title.slice(0, 28), title.slice(28)]);
  });

  // The stand-in measure counts code points: a family is 7, a flag 2.
  const FAMILY = '👨‍👩‍👧‍👦';
  const FLAG = '🇺🇸';

  it('never breaks inside an emoji made of several characters', () => {
    expect(layout(`ab${FAMILY.repeat(5)}`).lines.map((l) => l.text)).toEqual([
      `ab${FAMILY.repeat(3)}`,
      FAMILY.repeat(2),
    ]);
    expect(layout(`x${FLAG.repeat(20)}`).lines.map((l) => l.text)).toEqual([
      `x${FLAG.repeat(13)}`,
      FLAG.repeat(7),
    ]);
  });

  it('never cuts an emoji in half for the ellipsis', () => {
    expect(layout(`${'x'.repeat(28)} ${FLAG.repeat(20)}`).lines.map((l) => l.text)).toEqual([
      'x'.repeat(28),
      `${FLAG.repeat(13)}…`,
    ]);
    expect(
      layout(`${'x'.repeat(28)} ${'y'.repeat(21)}${FAMILY} ${'z'.repeat(10)}`).lines.map(
        (l) => l.text,
      ),
    ).toEqual(['x'.repeat(28), `${'y'.repeat(21)}…`]);
  });
});

describe('textDirection', () => {
  it('reads a title from its first letter', () => {
    expect(textDirection('Bake sale helpers')).toBe('ltr');
    expect(textDirection('מתנדבים ליריד הספרים')).toBe('rtl');
    expect(textDirection('متطوعون لمعرض الكتاب')).toBe('rtl');
  });

  it('skips digits, spaces and punctuation, which don’t decide it', () => {
    expect(textDirection('2026: מתנדבים ליריד הספרים')).toBe('rtl');
    expect(textDirection(' "12" Bake sale')).toBe('ltr');
    expect(textDirection('2026 🎉')).toBe('ltr');
  });

  it('gives a Hebrew title one direction, though its second line starts with a Latin word', () => {
    const measure = (text: string, fontPx: number) => (Array.from(text).length * fontPx) / 2;
    const code = { size: 21, get: () => false };
    // 28 characters a line at this size, so "Zoom" starts the second.
    const { lines, direction } = qrPngLayout(
      code,
      'מתנדבים ליריד הספרים של בית Zoom ספר בשבת בבוקר והקמה ומכירה',
      measure,
      1000,
    );
    expect(lines[1]!.text.startsWith('Zoom')).toBe(true);
    expect(direction).toBe('rtl');
  });
});

describe('qrFileName', () => {
  it('names the picture after the signup the link is for', () => {
    expect(qrFileName('https://your-site.example/s/book-fair-k3x')).toBe('book-fair-k3x-qr.png');
  });

  it('ignores a trailing slash, a query and a fragment', () => {
    expect(qrFileName('https://your-site.example/s/book-fair-k3x/?ref=a#top')).toBe(
      'book-fair-k3x-qr.png',
    );
  });
});

describe('with the encoder the share panel loads', () => {
  it('reads its grid the right way round: the finder patterns sit in three corners', () => {
    const code = generate('https://your-site.example/s/snack-duty-spring-season', {
      minCorrectionLevel: correction.M,
    });
    // A version's side is 4 × version + 17 modules.
    expect((code.size - 17) % 4).toBe(0);
    const path = qrSvgPath(code);
    // Each finder's top edge is a run of seven: top left, then top right.
    expect(path.startsWith(`M${Q} ${Q}h7v1h-7z`)).toBe(true);
    expect(path).toContain(`M${Q + code.size - 7} ${Q}h7v1h-7z`);
    // Bottom left; nothing in the bottom right corner's top row.
    expect(path).toContain(`M${Q} ${Q + code.size - 7}h7v1h-7z`);
    expect(path).not.toContain(`M${Q + code.size - 7} ${Q + code.size - 7}h7`);
  });
});
