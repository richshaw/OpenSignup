import { describe, expect, it } from 'vitest';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { summarizeSlot } from './slot-summary';

function field(ref: string, label: string): SlotFieldDefinition {
  return {
    id: `fld_${ref}`,
    ref,
    label,
    fieldType: 'text',
    required: false,
    sortOrder: 0,
    config: { fieldType: 'text', maxLength: 200 },
  };
}

describe('summarizeSlot', () => {
  it('returns empty string when there are no fields', () => {
    expect(summarizeSlot([], { name: 'Alice' })).toBe('');
  });

  it('returns empty string when all values are absent', () => {
    const fields = [field('name', 'Name'), field('role', 'Role')];
    expect(summarizeSlot(fields, {})).toBe('');
  });

  it('skips null values', () => {
    const fields = [field('name', 'Name')];
    expect(summarizeSlot(fields, { name: null })).toBe('');
  });

  it('skips undefined values', () => {
    const fields = [field('name', 'Name')];
    expect(summarizeSlot(fields, { name: undefined })).toBe('');
  });

  it('skips empty string values', () => {
    const fields = [field('name', 'Name')];
    expect(summarizeSlot(fields, { name: '' })).toBe('');
  });

  it('formats a single present value', () => {
    const fields = [field('name', 'Name')];
    expect(summarizeSlot(fields, { name: 'Alice' })).toBe('Name: Alice');
  });

  it('joins multiple present values with ·', () => {
    const fields = [field('name', 'Name'), field('role', 'Role')];
    expect(summarizeSlot(fields, { name: 'Alice', role: 'Driver' })).toBe('Name: Alice · Role: Driver');
  });

  it('omits absent fields from the join', () => {
    const fields = [field('name', 'Name'), field('role', 'Role'), field('note', 'Note')];
    expect(summarizeSlot(fields, { name: 'Alice', note: 'Bringing cake' })).toBe(
      'Name: Alice · Note: Bringing cake',
    );
  });

  it('coerces numeric values to string', () => {
    const fields = [field('count', 'Count')];
    expect(summarizeSlot(fields, { count: 42 })).toBe('Count: 42');
  });

  it('ignores extra keys in values that have no corresponding field', () => {
    const fields = [field('name', 'Name')];
    expect(summarizeSlot(fields, { name: 'Alice', ghost: 'ignored' })).toBe('Name: Alice');
  });

  it('respects field order from the fields array', () => {
    const fields = [field('b', 'B'), field('a', 'A')];
    expect(summarizeSlot(fields, { a: '1', b: '2' })).toBe('B: 2 · A: 1');
  });
});
