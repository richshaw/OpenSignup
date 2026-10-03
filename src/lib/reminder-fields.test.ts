import { describe, expect, it } from 'vitest';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { pickAnchorRef, resolveAnchorRef, slotTimeOfDay } from './reminder-fields';

const date = (ref: string, sortOrder: number) => ({ ref, fieldType: 'date' as const, sortOrder });
const text = (ref: string, sortOrder: number) => ({ ref, fieldType: 'text' as const, sortOrder });

describe('pickAnchorRef', () => {
  it('returns null when there is no date field', () => {
    expect(pickAnchorRef([text('what', 0)])).toBeNull();
    expect(pickAnchorRef([])).toBeNull();
  });

  it('picks the first date field by sortOrder, whatever order the caller passed', () => {
    expect(pickAnchorRef([date('return', 2), text('what', 0), date('depart', 1)])).toBe('depart');
  });

  it('breaks a sortOrder tie by ref, in code-point order', () => {
    // Matches migration 0005's COLLATE "C" tiebreak exactly.
    expect(pickAnchorRef([date('b-day', 1), date('a-day', 1)])).toBe('a-day');
    expect(pickAnchorRef([date('ab', 1), date('a-b', 1)])).toBe('a-b');
  });
});

describe('resolveAnchorRef', () => {
  const fields = [text('what', 0), date('depart', 1), date('return', 2)];

  it('keeps a ref that still names a date field, even when it is not the first', () => {
    expect(resolveAnchorRef({ reminderFromFieldRef: 'return' }, fields)).toBe('return');
  });

  it('moves to the first date field when the ref names nothing', () => {
    expect(resolveAnchorRef({ reminderFromFieldRef: 'gone' }, fields)).toBe('depart');
    expect(resolveAnchorRef({}, fields)).toBe('depart');
  });

  it('moves when the ref names a field that is no longer a date', () => {
    expect(resolveAnchorRef({ reminderFromFieldRef: 'what' }, fields)).toBe('depart');
  });

  it('resolves to null once no date field is left', () => {
    expect(resolveAnchorRef({ reminderFromFieldRef: 'depart' }, [text('what', 0)])).toBeNull();
  });
});

describe('slotTimeOfDay', () => {
  // A trip: reminders come from the departure date, so the departure time is
  // the one paired with it.
  const field = (
    ref: string,
    fieldType: 'date' | 'time',
    sortOrder: number,
  ): SlotFieldDefinition => ({
    id: `fld_${ref}`,
    ref,
    label: ref,
    fieldType,
    sortOrder,
    config: { fieldType },
  });
  const trip = [
    field('depart-date', 'date', 0),
    field('depart-time', 'time', 1),
    field('return-date', 'date', 2),
    field('return-time', 'time', 3),
  ];
  const settings = { reminderFromFieldRef: 'depart-date' };

  it('is the paired time when the slot fills it in', () => {
    expect(
      slotTimeOfDay(settings, trip, { 'depart-date': '2026-11-18', 'depart-time': '09:30' }),
    ).toBe('09:30');
  });

  it('is null when the paired time is blank, even with another time filled in', () => {
    expect(
      slotTimeOfDay(settings, trip, { 'depart-date': '2026-11-18', 'return-time': '17:00' }),
    ).toBeNull();
  });

  it('is null for a value that is not a real time', () => {
    expect(
      slotTimeOfDay(settings, trip, { 'depart-date': '2026-11-18', 'depart-time': '24:00' }),
    ).toBeNull();
  });
});
