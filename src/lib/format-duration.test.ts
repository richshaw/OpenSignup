import { describe, expect, it } from 'vitest';
import { formatDuration } from './format-duration';

describe('formatDuration', () => {
  it('formats sub-hour values in minutes with pluralization', () => {
    expect(formatDuration(1)).toBe('1 minute');
    expect(formatDuration(30)).toBe('30 minutes');
    expect(formatDuration(59)).toBe('59 minutes');
  });

  it('formats clean hour-scale values in hours', () => {
    expect(formatDuration(60)).toBe('1 hour');
    expect(formatDuration(120)).toBe('2 hours');
    expect(formatDuration(180)).toBe('3 hours');
  });

  it('formats hours with a leftover as "X hours Y minutes" (never rounds up)', () => {
    expect(formatDuration(90)).toBe('1 hour 30 minutes');
    expect(formatDuration(75)).toBe('1 hour 15 minutes');
    expect(formatDuration(121)).toBe('2 hours 1 minute');
  });

  it('formats clean day-scale values in days', () => {
    expect(formatDuration(1440)).toBe('1 day');
    expect(formatDuration(2880)).toBe('2 days');
  });

  it('formats days with a leftover as "X days Y hours" (never rounds up)', () => {
    expect(formatDuration(2160)).toBe('1 day 12 hours');
    expect(formatDuration(1500)).toBe('1 day 1 hour');
  });

  it('drops sub-hour leftovers in the day branch so we never overstate', () => {
    expect(formatDuration(1470)).toBe('1 day');
  });
});
