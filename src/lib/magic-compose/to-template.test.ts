import { describe, expect, it } from 'vitest';
import { MagicComposeDraftSchema } from './prompt';
import { magicComposeToTemplate } from './to-template';

function parse(raw: unknown) {
  const r = MagicComposeDraftSchema.parse(raw);
  return magicComposeToTemplate(r);
}

describe('magicComposeToTemplate', () => {
  it("uses id 'magic-compose'", () => {
    const t = parse({
      title: 'My signup',
      fields: [{ ref: 'date', label: 'Date', fieldType: 'date' }],
      slots: [{ values: { date: '2026-04-25' } }],
    });
    expect(t.id).toBe('magic-compose');
  });

  it('fills config deterministically per fieldType', () => {
    const t = parse({
      title: 'My signup',
      fields: [
        { ref: 'date', label: 'Date', fieldType: 'date' },
        { ref: 'name', label: 'Name', fieldType: 'text' },
        { ref: 'qty', label: 'Qty', fieldType: 'number' },
        { ref: 'time', label: 'Time', fieldType: 'time' },
        { ref: 'team', label: 'Team', fieldType: 'enum', choices: ['Red', 'Blue'] },
      ],
      slots: [{ values: {} }],
    });
    expect(t.fields[0]?.config).toEqual({ fieldType: 'date' });
    expect(t.fields[1]?.config).toEqual({ fieldType: 'text', maxLength: 200 });
    expect(t.fields[2]?.config).toEqual({ fieldType: 'number' });
    expect(t.fields[3]?.config).toEqual({ fieldType: 'time' });
    expect(t.fields[4]?.config).toEqual({ fieldType: 'enum', choices: ['Red', 'Blue'] });
  });

  it('drops slot values that do not match a declared field ref', () => {
    const t = parse({
      title: 'My signup',
      fields: [{ ref: 'date', label: 'Date', fieldType: 'date' }],
      slots: [{ values: { date: '2026-04-25', stray: 'nope' } }],
    });
    expect(t.slots[0]?.values).toEqual({ date: '2026-04-25' });
  });

  it('rejects malformed date / time / enum values', () => {
    const t = parse({
      title: 'My signup',
      fields: [
        { ref: 'date', label: 'Date', fieldType: 'date' },
        { ref: 'time', label: 'Time', fieldType: 'time' },
        { ref: 'team', label: 'Team', fieldType: 'enum', choices: ['Red'] },
      ],
      slots: [
        { values: { date: '04/25/2026', time: '25:00', team: 'Green' } },
      ],
    });
    expect(t.slots[0]?.values).toEqual({});
  });

  it('coerces numbers and trims text', () => {
    const t = parse({
      title: 'My signup',
      fields: [
        { ref: 'qty', label: 'Qty', fieldType: 'number' },
        { ref: 'name', label: 'Name', fieldType: 'text' },
      ],
      slots: [{ values: { qty: '42', name: '   Liam   ' } }],
    });
    expect(t.slots[0]?.values).toEqual({ qty: 42, name: 'Liam' });
  });

  it('deduplicates field refs (keeps the first occurrence)', () => {
    const t = parse({
      title: 'My signup',
      fields: [
        { ref: 'date', label: 'Date one', fieldType: 'date' },
        { ref: 'date', label: 'Date two', fieldType: 'text' },
      ],
      slots: [{ values: { date: '2026-04-25' } }],
    });
    expect(t.fields).toHaveLength(1);
    expect(t.fields[0]?.label).toBe('Date one');
    expect(t.fields[0]?.fieldType).toBe('date');
  });

  it('assigns ascending sortOrder', () => {
    const t = parse({
      title: 'My signup',
      fields: [
        { ref: 'a', label: 'A', fieldType: 'text' },
        { ref: 'b', label: 'B', fieldType: 'text' },
      ],
      slots: [{ values: {} }, { values: {} }, { values: {} }],
    });
    expect(t.fields.map((f) => f.sortOrder)).toEqual([0, 1]);
    expect(t.slots.map((s) => s.sortOrder)).toEqual([0, 1, 2]);
  });

  it('preserves null capacity for unlimited slots', () => {
    const t = parse({
      title: 'My signup',
      fields: [{ ref: 'a', label: 'A', fieldType: 'text' }],
      slots: [{ values: { a: 'hi' }, capacity: null }],
    });
    expect(t.slots[0]?.capacity).toBeNull();
  });
});
