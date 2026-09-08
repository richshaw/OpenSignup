import { describe, expect, it } from 'vitest';
import { slotDetails } from './slot-label';

const fields = [
  { ref: 'date', label: 'Date', fieldType: 'date' },
  { ref: 'time', label: 'Time', fieldType: 'time' },
  { ref: 'role', label: 'Role', fieldType: 'text' },
];

describe('slotDetails', () => {
  it('returns every field with a value, in definition order', () => {
    expect(slotDetails(fields, { date: '2026-08-30', time: '13:00', role: 'Front desk' })).toEqual([
      { label: 'Date', value: 'Sun, Aug 30' },
      { label: 'Time', value: '13:00' },
      { label: 'Role', value: 'Front desk' },
    ]);
  });

  it('keeps the date field even when the signup groups by it', () => {
    // The old primary-field rule skipped the group field, which is how a
    // date-grouped signup ended up labelling its time value "What".
    expect(slotDetails(fields, { date: '2026-08-30', time: '13:00' })).toEqual([
      { label: 'Date', value: 'Sun, Aug 30' },
      { label: 'Time', value: '13:00' },
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
