import { describe, expect, it } from 'vitest';
import { formatDuration } from './format-duration';

describe('formatDuration', () => {
  it('formats sub-hour values in minutes with pluralization', () => {
    expect(formatDuration(1)).toBe('1 minute');
    expect(formatDuration(30)).toBe('30 minutes');
    expect(formatDuration(59)).toBe('59 minutes');
  });

  it('formats hour-scale values in hours with pluralization', () => {
    expect(formatDuration(60)).toBe('1 hour');
    expect(formatDuration(120)).toBe('2 hours');
    expect(formatDuration(180)).toBe('3 hours');
  });

  it('formats day-scale values in days with pluralization', () => {
    expect(formatDuration(1440)).toBe('1 day');
    expect(formatDuration(2880)).toBe('2 days');
  });
});
