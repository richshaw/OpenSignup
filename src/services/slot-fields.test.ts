import { describe, expect, it } from 'vitest';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { extractSlotAt, findReminderFields, validateSlotValues } from './slot-fields';

const def = (overrides: Partial<SlotFieldDefinition>): SlotFieldDefinition => ({
  id: 'fld_aaaaaaaaaaaaaaaaaaaaaa',
  ref: 'date',
  label: 'Date',
  fieldType: 'date',
  sortOrder: 0,
  config: { fieldType: 'date' },
  ...overrides,
});

describe('validateSlotValues', () => {
  it('accepts a valid date', () => {
    const r = validateSlotValues([def({})], { date: '2026-05-15' });
    expect(r.ok).toBe(true);
  });

  it('rejects bad date format', () => {
    const r = validateSlotValues([def({})], { date: '2026/05/15' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_input');
  });

  it('rejects calendar-impossible dates that would silently roll over or crash', () => {
    // 2026-02-30 would roll to Mar 2 in extractSlotAt; 2026-13-01 would become
    // an Invalid Date. Both must be rejected at the validation boundary.
    for (const date of ['2026-02-30', '2026-04-31', '2026-02-29', '2026-13-01', '2026-00-10']) {
      const r = validateSlotValues([def({})], { date });
      expect(r.ok, date).toBe(false);
    }
  });

  it('accepts a real leap day', () => {
    const r = validateSlotValues([def({})], { date: '2024-02-29' });
    expect(r.ok).toBe(true);
  });

  it('rejects out-of-range clock times', () => {
    const time = def({ ref: 'time', fieldType: 'time', config: { fieldType: 'time' } });
    for (const value of ['24:00', '25:00', '12:60', '99:99']) {
      const r = validateSlotValues([time], { time: value });
      expect(r.ok, value).toBe(false);
    }
  });

  it('accepts HH:MM time', () => {
    const r = validateSlotValues(
      [def({ ref: 'time', fieldType: 'time', config: { fieldType: 'time' } })],
      { time: '09:30' },
    );
    expect(r.ok).toBe(true);
  });

  it('rejects bad time', () => {
    const r = validateSlotValues(
      [def({ ref: 'time', fieldType: 'time', config: { fieldType: 'time' } })],
      { time: '9:30 AM' },
    );
    expect(r.ok).toBe(false);
  });

  it('enforces text maxLength', () => {
    const r = validateSlotValues(
      [
        def({
          ref: 'note',
          fieldType: 'text',
          config: { fieldType: 'text', maxLength: 5 },
        }),
      ],
      { note: 'too long' },
    );
    expect(r.ok).toBe(false);
  });

  it('accepts a number', () => {
    const r = validateSlotValues(
      [def({ ref: 'count', fieldType: 'number', config: { fieldType: 'number' } })],
      { count: 42 },
    );
    expect(r.ok).toBe(true);
  });

  it('rejects a non-numeric for number field', () => {
    const r = validateSlotValues(
      [def({ ref: 'count', fieldType: 'number', config: { fieldType: 'number' } })],
      { count: 'abc' },
    );
    expect(r.ok).toBe(false);
  });

  it('accepts an enum value from the choice list', () => {
    const r = validateSlotValues(
      [
        def({
          ref: 'subject',
          fieldType: 'enum',
          config: { fieldType: 'enum', choices: ['Math', 'Science'] },
        }),
      ],
      { subject: 'Math' },
    );
    expect(r.ok).toBe(true);
  });

  it('rejects an enum value not in choices', () => {
    const r = validateSlotValues(
      [
        def({
          ref: 'subject',
          fieldType: 'enum',
          config: { fieldType: 'enum', choices: ['Math', 'Science'] },
        }),
      ],
      { subject: 'History' },
    );
    expect(r.ok).toBe(false);
  });

  it('rejects unknown ref in values', () => {
    const r = validateSlotValues([def({})], { date: '2026-05-15', extra: 'oops' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_input');
  });

  it('allows a missing value (blanks pass through)', () => {
    const r = validateSlotValues([def({})], {});
    expect(r.ok).toBe(true);
  });

  it('treats null and empty string as missing (no type check)', () => {
    const r1 = validateSlotValues([def({})], { date: '' });
    const r2 = validateSlotValues([def({})], { date: null });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });
});

describe('extractSlotAt', () => {
  const dateField = def({ ref: 'date', fieldType: 'date' });
  const timeField = def({
    id: 'fld_ffffffffffffffffffffff',
    ref: 'time',
    fieldType: 'time',
    config: { fieldType: 'time' },
    sortOrder: 1,
  });

  it('combines date and time into a UTC instant', () => {
    const at = extractSlotAt({}, [dateField, timeField], { date: '2026-05-15', time: '09:30' });
    expect(at?.toISOString()).toBe('2026-05-15T09:30:00.000Z');
  });

  it('defaults to midnight UTC when no time field is present', () => {
    const at = extractSlotAt({}, [dateField], { date: '2026-05-15' });
    expect(at?.toISOString()).toBe('2026-05-15T00:00:00.000Z');
  });

  it('returns null for a calendar-impossible stored date instead of rolling over', () => {
    // Guards legacy/edge rows: a bad stored value must not become an Invalid
    // Date (which throws on serialization) or silently shift to another day.
    expect(extractSlotAt({}, [dateField], { date: '2026-02-30' })).toBeNull();
    expect(extractSlotAt({}, [dateField], { date: '2026-13-01' })).toBeNull();
  });
});

describe('findReminderFields', () => {
  const dateField = def({ ref: 'date', fieldType: 'date' });
  const altDate = def({
    id: 'fld_bbbbbbbbbbbbbbbbbbbbbb',
    ref: 'returnDate',
    fieldType: 'date',
    sortOrder: 1,
  });
  const timeField = def({
    id: 'fld_cccccccccccccccccccccc',
    ref: 'startTime',
    fieldType: 'time',
    config: { fieldType: 'time' },
    sortOrder: 0,
  });

  it('returns null date when no date fields exist', () => {
    const r = findReminderFields({ groupByFieldRefs: [] }, [
      def({ ref: 'note', fieldType: 'text', config: { fieldType: 'text', maxLength: 200 } }),
    ]);
    expect(r.dateField).toBeNull();
  });

  it('auto-picks the only date field', () => {
    const r = findReminderFields({ groupByFieldRefs: [] }, [dateField, timeField]);
    expect(r.dateField?.ref).toBe('date');
    expect(r.timeField?.ref).toBe('startTime');
  });

  it('uses reminderFromFieldRef when set with multiple date fields', () => {
    const r = findReminderFields(
      { groupByFieldRefs: [], reminderFromFieldRef: 'returnDate' },
      [dateField, altDate, timeField],
    );
    expect(r.dateField?.ref).toBe('returnDate');
  });

  it('returns ambiguous=true when 2+ date fields and reminderFromFieldRef unset', () => {
    const r = findReminderFields({ groupByFieldRefs: [] }, [dateField, altDate]);
    expect(r.ambiguous).toBe(true);
    expect(r.dateField).toBeNull();
  });

  it('falls back to no time field when none exists', () => {
    const r = findReminderFields({ groupByFieldRefs: [] }, [dateField]);
    expect(r.dateField?.ref).toBe('date');
    expect(r.timeField).toBeNull();
  });

  it('picks lowest sortOrder time field when several exist', () => {
    const t1 = def({
      id: 'fld_dddddddddddddddddddddd',
      ref: 't1',
      fieldType: 'time',
      config: { fieldType: 'time' },
      sortOrder: 5,
    });
    const t2 = def({
      id: 'fld_eeeeeeeeeeeeeeeeeeeeee',
      ref: 't2',
      fieldType: 'time',
      config: { fieldType: 'time' },
      sortOrder: 2,
    });
    const r = findReminderFields({ groupByFieldRefs: [] }, [dateField, t1, t2]);
    expect(r.timeField?.ref).toBe('t2');
  });
});
