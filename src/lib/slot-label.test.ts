import { describe, expect, it } from 'vitest';
import { slotDisplayLabel } from './slot-label';

const fields = [
  { ref: 'what', label: 'What', fieldType: 'text' },
  { ref: 'date', label: 'Date', fieldType: 'date' },
];

describe('slotDisplayLabel', () => {
  it('uses the primary field value, not the slug-shaped ref', () => {
    expect(
      slotDisplayLabel(
        fields,
        { what: 'Front Desk Shift', date: '2026-08-30' },
        'front-desk-shift-2026-08-30',
      ),
    ).toBe('Front Desk Shift');
  });

  it('skips the group-by field when picking the primary', () => {
    expect(
      slotDisplayLabel(fields, { what: 'Front Desk Shift', date: '2026-08-30' }, 'ref', 'what'),
    ).toBe('Sun, Aug 30');
  });

  it('formats a date primary the way the public page does', () => {
    expect(slotDisplayLabel([fields[1]!], { date: '2026-08-30' }, 'ref')).toBe('Sun, Aug 30');
  });

  it('falls back to the ref when the primary value is empty', () => {
    expect(slotDisplayLabel(fields, { what: '' }, 'cookies-2')).toBe('cookies-2');
  });

  it('falls back to the ref when the slot has no fields', () => {
    expect(slotDisplayLabel([], {}, 'slot-1788014486217-1')).toBe('slot-1788014486217-1');
  });
});
