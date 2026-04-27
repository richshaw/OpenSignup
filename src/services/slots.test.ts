import { describe, expect, it } from 'vitest';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { extractSlotAt } from './slots';

const dateField: SlotFieldDefinition = {
  id: 'fld_aaaaaaaaaaaaaaaaaaaaaa',
  ref: 'date',
  label: 'Date',
  fieldType: 'date',
  required: true,
  sortOrder: 0,
  config: { fieldType: 'date' },
};

const timeField: SlotFieldDefinition = {
  id: 'fld_bbbbbbbbbbbbbbbbbbbbbb',
  ref: 'startTime',
  label: 'Start Time',
  fieldType: 'time',
  required: false,
  sortOrder: 1,
  config: { fieldType: 'time' },
};

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
          required: false,
          sortOrder: 0,
          config: { fieldType: 'text', maxLength: 200 },
        },
      ],
      { note: 'hi' },
    );
    expect(at).toBeNull();
  });

  it('returns midnight UTC when only a date field is set', () => {
    const at = extractSlotAt({ groupByFieldRefs: [] }, [dateField], { date: '2026-05-15' });
    expect(at?.toISOString()).toBe('2026-05-15T00:00:00.000Z');
  });

  it('combines date with HH:MM time as UTC', () => {
    const at = extractSlotAt({ groupByFieldRefs: [] }, [dateField, timeField], {
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

  it('returns null when 2+ date fields and reminderFromFieldRef unset', () => {
    const altDate: SlotFieldDefinition = {
      id: 'fld_dddddddddddddddddddddd',
      ref: 'returnDate',
      label: 'Return',
      fieldType: 'date',
      required: false,
      sortOrder: 1,
      config: { fieldType: 'date' },
    };
    const at = extractSlotAt(
      { groupByFieldRefs: [] },
      [dateField, altDate],
      { date: '2026-05-15', returnDate: '2026-05-20' },
    );
    expect(at).toBeNull();
  });

  it('uses configured reminderFromFieldRef when set', () => {
    const altDate: SlotFieldDefinition = {
      id: 'fld_eeeeeeeeeeeeeeeeeeeeee',
      ref: 'returnDate',
      label: 'Return',
      fieldType: 'date',
      required: false,
      sortOrder: 1,
      config: { fieldType: 'date' },
    };
    const at = extractSlotAt(
      { groupByFieldRefs: [], reminderFromFieldRef: 'returnDate' },
      [dateField, altDate],
      { date: '2026-05-15', returnDate: '2026-05-20' },
    );
    expect(at?.toISOString()).toBe('2026-05-20T00:00:00.000Z');
  });

  it('returns null when the chosen date value is missing', () => {
    const at = extractSlotAt({ groupByFieldRefs: [] }, [dateField, timeField], {
      startTime: '09:00',
    });
    expect(at).toBeNull();
  });
});
