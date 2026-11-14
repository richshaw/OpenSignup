import { describe, expect, it } from 'vitest';
import { formatGrantDate } from './grant-date';

// Noon in the zone the tests run in, which is the zone the date is written in.
const at = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day, 12);
};

describe('formatGrantDate', () => {
  it('writes English day first, as the page always has', () => {
    expect(formatGrantDate(at('2026-11-14'), 'en')).toBe('14 Nov 2026');
    expect(formatGrantDate(at('2026-05-03'), 'en')).toBe('3 May 2026');
    expect(formatGrantDate(at('2026-09-14'), 'en')).toBe('14 Sept 2026');
  });

  it('writes Swedish dates in Swedish', () => {
    expect(formatGrantDate(at('2026-11-14'), 'sv')).toBe('14 nov. 2026');
    expect(formatGrantDate(at('2026-05-03'), 'sv')).toBe('3 maj 2026');
  });
});
