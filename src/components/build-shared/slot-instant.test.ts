import { describe, expect, it } from 'vitest';
import { slotInstantOf } from './slot-instant';

const date = (ref: string, sortOrder: number) => ({ ref, fieldType: 'date' as const, sortOrder });
const text = (ref: string, sortOrder: number) => ({ ref, fieldType: 'text' as const, sortOrder });

describe('slotInstantOf', () => {
  const time = (ref: string, sortOrder: number) => ({ ref, fieldType: 'time' as const, sortOrder });
  const fields = [
    text('what', 0),
    date('depart', 1),
    time('leaves', 2),
    date('return', 3),
    time('back', 4),
  ];

  it('joins the named date with the time field paired with it', () => {
    const values = { depart: '2030-05-01', leaves: '09:30', return: '2030-05-03', back: '17:00' };
    expect(slotInstantOf('depart', fields, values)).toBe('2030-05-01T09:30');
    expect(slotInstantOf('return', fields, values)).toBe('2030-05-03T17:00');
  });

  it('anchors a slot with no time at 12:00, as slot_at does', () => {
    expect(slotInstantOf('depart', fields, { depart: '2030-05-01' })).toBe('2030-05-01T12:00');
    expect(slotInstantOf('depart', fields, { depart: '2030-05-01', leaves: '99:99' })).toBe(
      '2030-05-01T12:00',
    );
  });

  it('is null without a real date in the named field', () => {
    expect(slotInstantOf('depart', fields, {})).toBeNull();
    expect(slotInstantOf('depart', fields, { depart: '2030-02-30' })).toBeNull();
    expect(slotInstantOf('what', fields, { what: '2030-05-01' })).toBeNull();
  });

  it("ignores another date field's value", () => {
    const before = { depart: '2030-05-01', return: '2030-05-03' };
    expect(slotInstantOf('depart', fields, { ...before, return: '2030-06-01' })).toBe(
      slotInstantOf('depart', fields, before),
    );
  });
});
