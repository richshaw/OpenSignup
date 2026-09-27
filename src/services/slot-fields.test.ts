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

  it('takes a two-digit year as written rather than as 19xx', () => {
    // Date.UTC(99, 11, 31) is 1999-12-31, which would fail the round trip and
    // reject a well-formed date. Odd input, but the check must not lie about it.
    expect(validateSlotValues([def({})], { date: '0099-12-31' }).ok).toBe(true);
    expect(validateSlotValues([def({})], { date: '0099-02-29' }).ok).toBe(false);
  });

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

  it('uses the date field reminderFromFieldRef names', () => {
    const r = findReminderFields({ groupByFieldRefs: [], reminderFromFieldRef: 'date' }, [
      dateField,
      timeField,
    ]);
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

  it('never guesses: an unset ref resolves to no date field even with exactly one', () => {
    // The services keep the ref set whenever a date field exists, so an unset
    // ref here is a signup with no anchor — not an invitation to pick one.
    // Guessing "the only date field" hid the two-date-fields hole for months.
    expect(findReminderFields({ groupByFieldRefs: [] }, [dateField]).dateField).toBeNull();
    expect(findReminderFields({ groupByFieldRefs: [] }, [dateField, altDate]).dateField).toBeNull();
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

  it('ignores a ref that names a field which is not a date', () => {
    const r = findReminderFields({ groupByFieldRefs: [], reminderFromFieldRef: 'startTime' }, [
      dateField,
      timeField,
    ]);
    expect(r.dateField).toBeNull();
  });

  it('falls back to no time field when none exists', () => {
    const r = findReminderFields({ groupByFieldRefs: [], reminderFromFieldRef: 'date' }, [
      dateField,
    ]);
    expect(r.dateField?.ref).toBe('date');
    expect(r.timeField).toBeNull();
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

  it('falls back to the first time field when none follows the chosen date', () => {
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
    const lateDate = def({ id: 'fld_iiiiiiiiiiiiiiiiiiiiii', ref: 'late', fieldType: 'date', sortOrder: 9 });
    const r = findReminderFields({ groupByFieldRefs: [], reminderFromFieldRef: 'late' }, [
      lateDate,
      t1,
      t2,
    ]);
    expect(r.timeField?.ref).toBe('t2');
  });
});
