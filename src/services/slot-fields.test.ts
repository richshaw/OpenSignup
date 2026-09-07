import { describe, expect, it } from 'vitest';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { findReminderFields, validateSlotValues } from './slot-fields';

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

  // The shape regex alone accepted all of these. They reached new Date() as an
  // Invalid Date, which recomputeSlotAtForSignup then rewrote on every pass
  // because NaN is never equal to itself.
  it.each(['2026-13-45', '2026-02-30', '2026-00-10', '2026-01-32'])(
    'rejects the impossible date %s',
    (date) => {
      const r = validateSlotValues([def({})], { date });
      expect(r.ok).toBe(false);
    },
  );

  it('accepts a real leap day and rejects one in a common year', () => {
    expect(validateSlotValues([def({})], { date: '2028-02-29' }).ok).toBe(true);
    expect(validateSlotValues([def({})], { date: '2026-02-29' }).ok).toBe(false);
  });

  it.each(['99:99', '24:00', '12:60'])('rejects the impossible time %s', (time) => {
    const r = validateSlotValues(
      [def({ ref: 'time', fieldType: 'time', config: { fieldType: 'time' } })],
      { time },
    );
    expect(r.ok).toBe(false);
  });

  it('accepts the edges of the clock', () => {
    const field = [def({ ref: 'time', fieldType: 'time', config: { fieldType: 'time' } })];
    expect(validateSlotValues(field, { time: '00:00' }).ok).toBe(true);
    expect(validateSlotValues(field, { time: '23:59' }).ok).toBe(true);
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
    const r = findReminderFields({ groupByFieldRefs: [], reminderFromFieldRef: 'returnDate' }, [
      dateField,
      altDate,
      timeField,
    ]);
    expect(r.dateField?.ref).toBe('returnDate');
  });

  it('auto-picks the first date field when several exist and none is configured', () => {
    // Was: returned null and killed reminders for the whole signup. Resolution
    // is total now, so a second date field can never switch reminders off.
    const r = findReminderFields({ groupByFieldRefs: [] }, [dateField, altDate]);
    expect(r.dateField?.ref).toBe('date');
  });

  it('picks by sortOrder, not by the order the caller passed', () => {
    const r = findReminderFields({ groupByFieldRefs: [] }, [altDate, dateField]);
    expect(r.dateField?.ref).toBe('date');
  });

  it('does not let a field added later outrank a template field', () => {
    // Regression. DEFAULT_TEMPLATE pins its date column at sortOrder 1, and the
    // build page adds fields without sending a sortOrder. While the input schema
    // defaulted that to 0, a newly added date column sorted ahead of the working
    // one and took the anchor — and since it has no values on any existing slot,
    // recomputing wiped every slot_at and killed reminders already promised.
    // addField now appends instead, so the added field cannot be dateFields[0].
    const templateDate = def({ ref: 'date', fieldType: 'date', sortOrder: 1 });
    const appended = def({
      id: 'fld_iiiiiiiiiiiiiiiiiiiiii',
      ref: 'deadline',
      fieldType: 'date',
      sortOrder: 2,
    });
    const r = findReminderFields({ groupByFieldRefs: [] }, [templateDate, appended]);
    expect(r.dateField?.ref).toBe('date');
  });

  it('returns a null date when reminderFromFieldRef points at nothing', () => {
    // Deliberately no fallback: one typo must not re-aim every reminder on the
    // signup at a different column.
    const r = findReminderFields({ groupByFieldRefs: [], reminderFromFieldRef: 'nope' }, [
      dateField,
      altDate,
    ]);
    expect(r.dateField).toBeNull();
  });

  it('pairs the time field that follows the chosen date, not the lowest overall', () => {
    const departTime = def({
      id: 'fld_ffffffffffffffffffffff',
      ref: 'departTime',
      fieldType: 'time',
      config: { fieldType: 'time' },
      sortOrder: 1,
    });
    const returnTime = def({
      id: 'fld_gggggggggggggggggggggg',
      ref: 'returnTime',
      fieldType: 'time',
      config: { fieldType: 'time' },
      sortOrder: 3,
    });
    const returnDate = def({
      id: 'fld_hhhhhhhhhhhhhhhhhhhhhh',
      ref: 'returnDate',
      fieldType: 'date',
      sortOrder: 2,
    });
    const r = findReminderFields({ groupByFieldRefs: [], reminderFromFieldRef: 'returnDate' }, [
      dateField,
      departTime,
      returnDate,
      returnTime,
    ]);
    expect(r.dateField?.ref).toBe('returnDate');
    expect(r.timeField?.ref).toBe('returnTime');
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
