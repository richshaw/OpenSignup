import { describe, expect, it } from 'vitest';
import { correction, generate } from 'lean-qr/nano';
import {
  QR_QUIET_ZONE,
  qrFileName,
  qrPngScale,
  qrRuns,
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

describe('qrSide and qrPngScale', () => {
  // The smallest QR code is 21 modules a side; 29 with its margin.
  const smallest = grid(...Array.from({ length: 21 }, () => '.'.repeat(21)));

  it('adds the margin to both sides', () => {
    expect(qrSide(smallest)).toBe(21 + 2 * Q);
  });

  it('picks whole pixels per module, enough to reach the width asked for', () => {
    const scale = qrPngScale(smallest, 1000);
    expect(scale).toBe(35);
    expect(scale * qrSide(smallest)).toBeGreaterThanOrEqual(1000);
    expect((scale - 1) * qrSide(smallest)).toBeLessThan(1000);
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
