import { describe, expect, it } from 'vitest';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { findReminderFields, validateSlotValues } from './slot-fields';

const def = (overrides: Partial<SlotFieldDefinition>): SlotFieldDefinition => ({
  id: 'fld_aaaaaaaaaaaaaaaaaaaaaa',
  ref: 'date',
  label: 'Date',
  fieldType: 'date',
  required: true,
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

  it('rejects missing required field', () => {
    const r = validateSlotValues([def({})], {});
    expect(r.ok).toBe(false);
  });

  it('allows empty optional field', () => {
    const r = validateSlotValues([def({ required: false })], {});
    expect(r.ok).toBe(true);
  });

  it('coerces null/empty string as missing for required check', () => {
    const r1 = validateSlotValues([def({})], { date: '' });
    const r2 = validateSlotValues([def({})], { date: null });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
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
