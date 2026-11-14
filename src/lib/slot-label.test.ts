import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatSlotDate, formatSlotTime, renderFieldValue, slotDetails } from './slot-label';

const fields = [
  { ref: 'date', label: 'Date', fieldType: 'date' },
  { ref: 'time', label: 'Time', fieldType: 'time' },
  { ref: 'role', label: 'Role', fieldType: 'text' },
];

describe('slotDetails', () => {
  it('returns every field with a value, in definition order', () => {
    expect(
      slotDetails(fields, { date: '2026-08-30', time: '13:00', role: 'Front desk' }, 'en'),
    ).toEqual([
      { label: 'Date', value: 'Sun, Aug 30' },
      { label: 'Time', value: '1:00\u00a0PM' },
      { label: 'Role', value: 'Front desk' },
    ]);
  });

  it('keeps the date field even when the signup groups by it', () => {
    // The old primary-field rule skipped the group field, which is how a
    // date-grouped signup ended up labelling its time value "What".
    expect(slotDetails(fields, { date: '2026-08-30', time: '13:00' }, 'en')).toEqual([
      { label: 'Date', value: 'Sun, Aug 30' },
      { label: 'Time', value: '1:00\u00a0PM' },
    ]);
  });

  it('drops fields the slot has no value for', () => {
    expect(slotDetails(fields, { role: 'Front desk', time: '' }, 'en')).toEqual([
      { label: 'Role', value: 'Front desk' },
    ]);
  });

  it('is empty for a slot with no fields', () => {
    expect(slotDetails([], {}, 'en')).toEqual([]);
  });

  it('reads the values in the language it is given', () => {
    expect(
      slotDetails(fields, { date: '2025-05-03', time: '13:00', role: 'Front desk' }, 'sv'),
    ).toEqual([
      { label: 'Date', value: 'lör 3 maj' },
      { label: 'Time', value: '13:00' },
      { label: 'Role', value: 'Front desk' },
    ]);
  });
});

describe('formatSlotDate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null for null/empty/invalid', () => {
    expect(formatSlotDate(null, 'en')).toBeNull();
    expect(formatSlotDate(undefined, 'en')).toBeNull();
    expect(formatSlotDate('', 'en')).toBeNull();
    expect(formatSlotDate('not-a-date', 'en')).toBeNull();
  });

  it('returns null for a YYYY-MM-DD day that does not exist, rather than rolling it over', () => {
    expect(formatSlotDate('2026-02-31', 'en')).toBeNull();
    expect(formatSlotDate('2026-13-01', 'en')).toBeNull();
    expect(formatSlotDate('2026-02-31', 'sv')).toBeNull();
  });

  it('formats a stored YYYY-MM-DD as Weekday, Mon Day', () => {
    expect(formatSlotDate('2026-04-25', 'en')).toBe('Sat, Apr 25');
    expect(formatSlotDate('2026-08-30', 'en')).toBe('Sun, Aug 30');
  });

  it('formats nothing but a stored YYYY-MM-DD', () => {
    // A timestamp or a typed date would go through `new Date()`, in the
    // host's zone, and "Sat, Nov 14" would come out as a Wednesday in 2001.
    expect(formatSlotDate('2026-04-25T15:00:00Z', 'en')).toBeNull();
    expect(formatSlotDate('Sat, Nov 14', 'en')).toBeNull();
  });

  it('formats a date in Swedish', () => {
    expect(formatSlotDate('2025-05-03', 'sv')).toBe('lör 3 maj');
  });

  it('renders YYYY-MM-DD on the same calendar day across timezones', () => {
    // 2026-04-25 is a Saturday. With `new Date('2026-04-25')` the value parses
    // as UTC midnight, then `toLocaleDateString` shifts to the host TZ — so in
    // negative offsets it would render as Fri, Apr 24. Verify both sides of
    // UTC return the intended calendar day.
    const instant = new Date('2026-04-25T12:00:00Z');
    vi.stubEnv('TZ', 'America/Los_Angeles');
    expect(instant.getHours()).toBe(5);
    expect(formatSlotDate('2026-04-25', 'en')).toBe('Sat, Apr 25');
    expect(formatSlotDate('2025-05-03', 'sv')).toBe('lör 3 maj');
    vi.stubEnv('TZ', 'Pacific/Auckland');
    expect(instant.getHours()).toBe(0);
    expect(formatSlotDate('2026-04-25', 'en')).toBe('Sat, Apr 25');
    expect(formatSlotDate('2025-05-03', 'sv')).toBe('lör 3 maj');
  });
});

describe('formatSlotTime', () => {
  it('reads a 24-hour HH:MM on a 12-hour clock', () => {
    expect(formatSlotTime('18:30', 'en')).toBe('6:30\u00a0PM');
    expect(formatSlotTime('09:05', 'en')).toBe('9:05\u00a0AM');
    expect(formatSlotTime('23:59', 'en')).toBe('11:59\u00a0PM');
  });

  it('names midnight and noon as 12, not 0', () => {
    expect(formatSlotTime('00:00', 'en')).toBe('12:00\u00a0AM');
    expect(formatSlotTime('00:15', 'en')).toBe('12:15\u00a0AM');
    expect(formatSlotTime('12:00', 'en')).toBe('12:00\u00a0PM');
    expect(formatSlotTime('12:30', 'en')).toBe('12:30\u00a0PM');
  });

  it('returns null for anything that is not a real HH:MM', () => {
    expect(formatSlotTime(null, 'en')).toBeNull();
    expect(formatSlotTime('', 'en')).toBeNull();
    expect(formatSlotTime('24:00', 'en')).toBeNull();
    expect(formatSlotTime('9:30', 'en')).toBeNull();
    expect(formatSlotTime('6:30\u00a0PM', 'en')).toBeNull();
    expect(formatSlotTime('24:00', 'sv')).toBeNull();
  });

  it('reads a time on a 24-hour clock in Swedish', () => {
    expect(formatSlotTime('18:30', 'sv')).toBe('18:30');
    expect(formatSlotTime('09:05', 'sv')).toBe('09:05');
    expect(formatSlotTime('00:00', 'sv')).toBe('00:00');
  });

  describe('across timezones', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('keeps the hour that was stored', () => {
      for (const tz of ['America/Los_Angeles', 'Pacific/Auckland']) {
        vi.stubEnv('TZ', tz);
        expect(formatSlotTime('00:30', 'sv')).toBe('00:30');
        expect(formatSlotTime('23:30', 'sv')).toBe('23:30');
        expect(formatSlotTime('00:30', 'en')).toBe('12:30\u00a0AM');
      }
    });
  });
});

describe('renderFieldValue for time fields', () => {
  const time = { ref: 't', label: 'Time', fieldType: 'time' };

  it('formats a time value', () => {
    expect(renderFieldValue(time, '18:30', 'en')).toBe('6:30\u00a0PM');
  });

  it('formats a time value in Swedish', () => {
    expect(renderFieldValue(time, '18:30', 'sv')).toBe('18:30');
  });

  it('falls back to the raw string when the value does not parse', () => {
    expect(renderFieldValue(time, 'after the game', 'en')).toBe('after the game');
    expect(renderFieldValue(time, 'after the game', 'sv')).toBe('after the game');
  });

  it('leaves a text field that looks like a time alone', () => {
    expect(renderFieldValue({ ref: 'x', label: 'X', fieldType: 'text' }, '18:30', 'en')).toBe(
      '18:30',
    );
  });
});

describe('renderFieldValue for date fields', () => {
  const date = { ref: 'd', label: 'Date', fieldType: 'date' };

  it('formats a stored-shape date', () => {
    expect(renderFieldValue(date, '2026-05-21', 'en')).toBe('Thu, May 21');
    expect(renderFieldValue(date, '2025-05-03', 'sv')).toBe('lör 3 maj');
  });

  it('leaves a date string that is not in the stored shape as it is', () => {
    // `new Date()` would read "Sat, Nov 14" as Nov 14, 2001, a Wednesday.
    expect(renderFieldValue(date, 'Sat, Nov 14', 'en')).toBe('Sat, Nov 14');
    expect(renderFieldValue(date, '05/21/2026', 'en')).toBe('05/21/2026');
    expect(renderFieldValue(date, '2026-05-21T10:00:00Z', 'en')).toBe('2026-05-21T10:00:00Z');
  });

  it('leaves a date that does not exist as it is, rather than rolling it over', () => {
    expect(renderFieldValue(date, '2026-02-31', 'en')).toBe('2026-02-31');
    expect(renderFieldValue(date, '2026-13-01', 'en')).toBe('2026-13-01');
    expect(renderFieldValue(date, '2026-02-31', 'sv')).toBe('2026-02-31');
  });
});

describe('renderFieldValue with only spaces', () => {
  it('returns null, as for an empty string', () => {
    expect(
      renderFieldValue({ ref: 'what', label: 'What', fieldType: 'text' }, '   ', 'en'),
    ).toBeNull();
  });

  it('leaves the line out of slotDetails', () => {
    expect(slotDetails(fields, { role: '   ', date: '2026-08-30' }, 'en')).toEqual([
      { label: 'Date', value: 'Sun, Aug 30' },
    ]);
  });
});
