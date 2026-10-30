import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../tailwind.config';

// WCAG 2 contrast ratio between two #rrggbb colours.
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const { brand } = config.theme.extend.colors;

describe('blue buttons', () => {
  it('keep white text at 4.5:1 or more, at rest and on hover', () => {
    expect(contrast('#ffffff', brand.DEFAULT)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', brand.hover)).toBeGreaterThanOrEqual(4.5);
  });

  it('darken on hover rather than brighten', () => {
    // Brightening #1f6feb by 10%, or fading it to 90% over white, gives
    // about 3.96:1 against white.
    const offenders = sourceFiles(path.join(__dirname)).filter((file) => {
      const text = readFileSync(file, 'utf8');
      return /\bbg-brand\b/.test(text) && /hover:(brightness-1\d\d|bg-brand\/\d+)/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
