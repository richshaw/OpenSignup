import { describe, expect, it } from 'vitest';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { extractSlotAt } from './slot-fields';

const dateField: SlotFieldDefinition = {
  id: 'fld_aaaaaaaaaaaaaaaaaaaaaa',
  ref: 'date',
  label: 'Date',
  fieldType: 'date',
  sortOrder: 0,
  config: { fieldType: 'date' },
};

const timeField: SlotFieldDefinition = {
  id: 'fld_bbbbbbbbbbbbbbbbbbbbbb',
  ref: 'startTime',
  label: 'Start Time',
  fieldType: 'time',
  sortOrder: 1,
  config: { fieldType: 'time' },
};

const anchored = { groupByFieldRefs: [], reminderFromFieldRef: 'date' };

describe('extractSlotAt', () => {
  it('returns null when no date field is configured', () => {
    const at = extractSlotAt(
      { groupByFieldRefs: [] },
      [
        {
          id: 'fld_cccccccccccccccccccccc',
          ref: 'note',
          label: 'Note',
          fieldType: 'text',
          sortOrder: 0,
          config: { fieldType: 'text', maxLength: 200 },
        },
      ],
      { note: 'hi' },
    );
    expect(at).toBeNull();
  });

  it('anchors a date-only slot at noon UTC, not midnight', () => {
    // Reminders go out a day before this instant. A day before midnight UTC is
    // 5pm two days before in Los Angeles; a day before noon UTC is still the
    // day before everywhere from UTC-11 to UTC+11.
    const at = extractSlotAt(anchored, [dateField], { date: '2026-05-15' });
    expect(at?.toISOString()).toBe('2026-05-15T12:00:00.000Z');
  });

  it('treats a blank time value as date-only', () => {
    const at = extractSlotAt(anchored, [dateField, timeField], {
      date: '2026-05-15',
      startTime: '',
    });
    expect(at?.toISOString()).toBe('2026-05-15T12:00:00.000Z');
  });

  it('combines date with HH:MM time as UTC', () => {
    const at = extractSlotAt(anchored, [dateField, timeField], {
      date: '2026-05-15',
      startTime: '09:30',
    });
    expect(at?.toISOString()).toBe('2026-05-15T09:30:00.000Z');
  });

  it('returns null when reminderFromFieldRef points at a non-existent ref', () => {
    const at = extractSlotAt(
      { groupByFieldRefs: [], reminderFromFieldRef: 'nope' },
      [dateField],
      { date: '2026-05-15' },
    );
    expect(at).toBeNull();
  });

  it('returns null when no anchor is chosen, however many date fields exist', () => {
    // No guessing: the services keep reminderFromFieldRef set whenever a date
    // field exists, so an unset ref is a signup with no anchor.
    const altDate: SlotFieldDefinition = {
      id: 'fld_dddddddddddddddddddddd',
      ref: 'returnDate',
      label: 'Return',
      fieldType: 'date',
      sortOrder: 1,
      config: { fieldType: 'date' },
    };
    expect(extractSlotAt({ groupByFieldRefs: [] }, [dateField], { date: '2026-05-15' })).toBeNull();
    expect(
      extractSlotAt({ groupByFieldRefs: [] }, [dateField, altDate], {
        date: '2026-05-15',
        returnDate: '2026-05-20',
      }),
    ).toBeNull();
  });

  it('uses configured reminderFromFieldRef when set', () => {
    const altDate: SlotFieldDefinition = {
      id: 'fld_eeeeeeeeeeeeeeeeeeeeee',
      ref: 'returnDate',
      label: 'Return',
      fieldType: 'date',
      sortOrder: 1,
      config: { fieldType: 'date' },
    };
    const at = extractSlotAt(
      { groupByFieldRefs: [], reminderFromFieldRef: 'returnDate' },
      [dateField, altDate],
      { date: '2026-05-15', returnDate: '2026-05-20' },
    );
    expect(at?.toISOString()).toBe('2026-05-20T12:00:00.000Z');
  });

  it('returns null rather than an Invalid Date for an impossible date value', () => {
    // Reaches here only through a legacy row: validateSlotValues now rejects it
    // on the way in. An Invalid Date would make recomputeSlotAtForSignup rewrite
    // the row on every pass, since NaN never compares equal to itself.
    const at = extractSlotAt(anchored, [dateField], { date: '2026-13-45' });
    expect(at).toBeNull();
  });

  it('returns null when the chosen date value is missing', () => {
    const at = extractSlotAt(anchored, [dateField, timeField], {
      startTime: '09:00',
    });
    expect(at).toBeNull();
  });
});
