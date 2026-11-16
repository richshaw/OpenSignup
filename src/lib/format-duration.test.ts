import { describe, expect, it } from 'vitest';
import { formatDuration, waitInMinutes } from './format-duration';

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

describe('waitInMinutes', () => {
  it('rounds a wait in seconds up to whole minutes, never under one', () => {
    expect(waitInMinutes(1)).toBe('1 minute');
    expect(waitInMinutes(60)).toBe('1 minute');
    expect(waitInMinutes(61)).toBe('2 minutes');
    expect(waitInMinutes(119)).toBe('2 minutes');
    expect(waitInMinutes(3412)).toBe('57 minutes');
  });
});

describe('formatDuration in other languages', () => {
  it('writes English the same when it is asked for by name', () => {
    for (const minutes of [0, 1, 30, 60, 90, 121, 1440, 1500, 2160]) {
      expect(formatDuration(minutes, 'en')).toBe(formatDuration(minutes));
    }
  });

  it('plurals English for 0, 1 and many of each unit', () => {
    expect(formatDuration(0)).toBe('0 minutes');
    expect(formatDuration(1)).toBe('1 minute');
    expect(formatDuration(2)).toBe('2 minutes');
    expect(formatDuration(60)).toBe('1 hour');
    expect(formatDuration(600)).toBe('10 hours');
    expect(formatDuration(1440)).toBe('1 day');
    expect(formatDuration(30 * 1440)).toBe('30 days');
  });

  it('never groups digits, so a long English span reads as it always has', () => {
    expect(formatDuration(1000 * 1440)).toBe('1000 days');
  });

  it('plurals Swedish for 0, 1 and many of each unit', () => {
    expect(formatDuration(0, 'sv')).toBe('0 minuter');
    expect(formatDuration(1, 'sv')).toBe('1 minut');
    expect(formatDuration(30, 'sv')).toBe('30 minuter');
    expect(formatDuration(60, 'sv')).toBe('1 timme');
    expect(formatDuration(120, 'sv')).toBe('2 timmar');
    // Swedish names a day as a span of time "dygn", the same in the singular and plural.
    expect(formatDuration(1440, 'sv')).toBe('1 dygn');
    expect(formatDuration(90 * 1440, 'sv')).toBe('90 dygn');
  });

  it('writes two Swedish units side by side, rounding down as English does', () => {
    expect(formatDuration(90, 'sv')).toBe('1 timme 30 minuter');
    expect(formatDuration(121, 'sv')).toBe('2 timmar 1 minut');
    expect(formatDuration(2160, 'sv')).toBe('1 dygn 12 timmar');
    expect(formatDuration(1470, 'sv')).toBe('1 dygn');
  });
});

describe('waitInMinutes in other languages', () => {
  it('writes the wait in Swedish, rounded up and never under one', () => {
    expect(waitInMinutes(1, 'sv')).toBe('1 minut');
    expect(waitInMinutes(61, 'sv')).toBe('2 minuter');
    expect(waitInMinutes(3412, 'sv')).toBe('57 minuter');
    expect(waitInMinutes(3412, 'en')).toBe('57 minutes');
  });
});
