import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatSlotDate, formatSlotTime, renderFieldValue, slotDetails } from './slot-label';

const fields = [
  { ref: 'date', label: 'Date', fieldType: 'date' },
  { ref: 'time', label: 'Time', fieldType: 'time' },
  { ref: 'role', label: 'Role', fieldType: 'text' },
];

describe('slotDetails', () => {
  it('returns every field with a value, in definition order', () => {
    expect(slotDetails(fields, { date: '2026-08-30', time: '13:00', role: 'Front desk' })).toEqual([
      { label: 'Date', value: 'Sun, Aug 30' },
      { label: 'Time', value: '1:00\u00a0PM' },
      { label: 'Role', value: 'Front desk' },
    ]);
  });

  it('keeps the date field even when the signup groups by it', () => {
    // The old primary-field rule skipped the group field, which is how a
    // date-grouped signup ended up labelling its time value "What".
    expect(slotDetails(fields, { date: '2026-08-30', time: '13:00' })).toEqual([
      { label: 'Date', value: 'Sun, Aug 30' },
      { label: 'Time', value: '1:00\u00a0PM' },
    ]);
  });

  it('drops fields the slot has no value for', () => {
    expect(slotDetails(fields, { role: 'Front desk', time: '' })).toEqual([
      { label: 'Role', value: 'Front desk' },
    ]);
  });

  it('is empty for a slot with no fields', () => {
    expect(slotDetails([], {})).toEqual([]);
  });
});

describe('formatSlotDate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null for null/empty/invalid', () => {
    expect(formatSlotDate(null)).toBeNull();
    expect(formatSlotDate(undefined)).toBeNull();
    expect(formatSlotDate('')).toBeNull();
    expect(formatSlotDate('not-a-date')).toBeNull();
  });

  it('returns null for a YYYY-MM-DD day that does not exist, rather than rolling it over', () => {
    expect(formatSlotDate('2026-02-31')).toBeNull();
    expect(formatSlotDate('2026-13-01')).toBeNull();
  });

  it('formats ISO into Weekday, Mon Day', () => {
    // 2026-04-25 is a Saturday in UTC; we accept any locale-correct prefix
    // by asserting the shape rather than the exact string.
    const out = formatSlotDate('2026-04-25T15:00:00Z');
    expect(out).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/);
  });

  it('renders YYYY-MM-DD on the same calendar day across timezones', () => {
    // 2026-04-25 is a Saturday. With `new Date('2026-04-25')` the value parses
    // as UTC midnight, then `toLocaleDateString` shifts to the host TZ — so in
    // negative offsets it would render as Fri, Apr 24. Verify both sides of
    // UTC return the intended calendar day.
    const instant = new Date('2026-04-25T12:00:00Z');
    vi.stubEnv('TZ', 'America/Los_Angeles');
    expect(instant.getHours()).toBe(5);
    expect(formatSlotDate('2026-04-25')).toBe('Sat, Apr 25');
    vi.stubEnv('TZ', 'Pacific/Auckland');
    expect(instant.getHours()).toBe(0);
    expect(formatSlotDate('2026-04-25')).toBe('Sat, Apr 25');
  });
});

describe('formatSlotTime', () => {
  it('reads a 24-hour HH:MM on a 12-hour clock', () => {
    expect(formatSlotTime('18:30')).toBe('6:30\u00a0PM');
    expect(formatSlotTime('09:05')).toBe('9:05\u00a0AM');
    expect(formatSlotTime('23:59')).toBe('11:59\u00a0PM');
  });

  it('names midnight and noon as 12, not 0', () => {
    expect(formatSlotTime('00:00')).toBe('12:00\u00a0AM');
    expect(formatSlotTime('00:15')).toBe('12:15\u00a0AM');
    expect(formatSlotTime('12:00')).toBe('12:00\u00a0PM');
    expect(formatSlotTime('12:30')).toBe('12:30\u00a0PM');
  });

  it('returns null for anything that is not a real HH:MM', () => {
    expect(formatSlotTime(null)).toBeNull();
    expect(formatSlotTime('')).toBeNull();
    expect(formatSlotTime('24:00')).toBeNull();
    expect(formatSlotTime('9:30')).toBeNull();
    expect(formatSlotTime('6:30\u00a0PM')).toBeNull();
  });
});

describe('renderFieldValue for time fields', () => {
  const time = { ref: 't', label: 'Time', fieldType: 'time' };

  it('formats a time value', () => {
    expect(renderFieldValue(time, '18:30')).toBe('6:30\u00a0PM');
  });

  it('falls back to the raw string when the value does not parse', () => {
    expect(renderFieldValue(time, 'after the game')).toBe('after the game');
  });

  it('leaves a text field that looks like a time alone', () => {
    expect(renderFieldValue({ ref: 'x', label: 'X', fieldType: 'text' }, '18:30')).toBe('18:30');
  });
});
