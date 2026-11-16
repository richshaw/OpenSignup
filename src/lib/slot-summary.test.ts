import { describe, expect, it } from 'vitest';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { summarizeSlotValues } from './slot-summary';

function field(ref: string, label: string): SlotFieldDefinition {
  return {
    id: `fld_${ref}`,
    ref,
    label,
    fieldType: 'text',
    sortOrder: 0,
    config: { fieldType: 'text', maxLength: 200 },
  };
}

describe('summarizeSlotValues', () => {
  it('returns empty string when there are no fields', () => {
    expect(summarizeSlotValues([], { name: 'Alice' }, 'en')).toBe('');
  });

  it('returns empty string when all values are absent', () => {
    const fields = [field('name', 'Name'), field('role', 'Role')];
    expect(summarizeSlotValues(fields, {}, 'en')).toBe('');
  });

  it('skips null values', () => {
    const fields = [field('name', 'Name')];
    expect(summarizeSlotValues(fields, { name: null }, 'en')).toBe('');
  });

  it('skips undefined values', () => {
    const fields = [field('name', 'Name')];
    expect(summarizeSlotValues(fields, { name: undefined }, 'en')).toBe('');
  });

  it('skips empty string values', () => {
    const fields = [field('name', 'Name')];
    expect(summarizeSlotValues(fields, { name: '' }, 'en')).toBe('');
  });

  it('formats a single present value', () => {
    const fields = [field('name', 'Name')];
    expect(summarizeSlotValues(fields, { name: 'Alice' }, 'en')).toBe('Alice');
  });

  it('joins multiple present values with ·', () => {
    const fields = [field('name', 'Name'), field('role', 'Role')];
    expect(summarizeSlotValues(fields, { name: 'Alice', role: 'Driver' }, 'en')).toBe(
      'Alice · Driver',
    );
  });

  it('omits absent fields from the join', () => {
    const fields = [field('name', 'Name'), field('role', 'Role'), field('note', 'Note')];
    expect(summarizeSlotValues(fields, { name: 'Alice', note: 'Bringing cake' }, 'en')).toBe(
      'Alice · Bringing cake',
    );
  });

  it('coerces numeric values to string', () => {
    const fields = [field('count', 'Count')];
    expect(summarizeSlotValues(fields, { count: 42 }, 'en')).toBe('42');
  });

  it('ignores extra keys in values that have no corresponding field', () => {
    const fields = [field('name', 'Name')];
    expect(summarizeSlotValues(fields, { name: 'Alice', ghost: 'ignored' }, 'en')).toBe('Alice');
  });

  it('respects field order from the fields array', () => {
    const fields = [field('b', 'B'), field('a', 'A')];
    expect(summarizeSlotValues(fields, { a: '1', b: '2' }, 'en')).toBe('2 · 1');
  });

  it('renders a date value the way the participant page does', () => {
    // Shared with the public page and the emails via slotDetails, so the
    // organizer never sees a raw ISO date where a participant sees a weekday.
    const fields = [{ ...field('day', 'Day'), fieldType: 'date' as const }];
    expect(summarizeSlotValues(fields, { day: '2026-08-30' }, 'en')).toBe('Sun, Aug 30');
  });

  it('joins the values without their labels', () => {
    const fields = [{ ...field('day', 'Day'), fieldType: 'date' as const }, field('role', 'Role')];
    expect(summarizeSlotValues(fields, { day: '2026-08-30', role: 'Front desk' }, 'en')).toBe(
      'Sun, Aug 30 · Front desk',
    );
  });

  it('reads the values in the language it is given', () => {
    const fields = [{ ...field('day', 'Day'), fieldType: 'date' as const }, field('role', 'Role')];
    expect(summarizeSlotValues(fields, { day: '2025-05-03', role: 'Front desk' }, 'sv')).toBe(
      'lör 3 maj · Front desk',
    );
  });

  it('is empty rather than falling back to the slug-shaped ref', () => {
    expect(summarizeSlotValues([field('role', 'Role')], {}, 'en')).toBe('');
  });
});
