import { describe, expect, it } from 'vitest';
import { FullDraftSchema } from './prompt';
import { buildWarnings, magicComposeToTemplate } from './to-template';

function parse(raw: unknown) {
  const r = FullDraftSchema.parse(raw);
  return magicComposeToTemplate(r).template;
}

function parseFull(raw: unknown) {
  const r = FullDraftSchema.parse(raw);
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

  describe('groupByFieldRefs', () => {
    it('honours the model-provided groupBy when it matches a field', () => {
      const r = parseFull({
        title: 'PT conferences',
        groupBy: 'class',
        fields: [
          { ref: 'class', label: 'Class', fieldType: 'enum', choices: ['Maple', 'Cedar'] },
          { ref: 'time', label: 'Time', fieldType: 'time' },
        ],
        slots: [
          { values: { class: 'Maple', time: '09:00' } },
          { values: { class: 'Cedar', time: '09:00' } },
        ],
      });
      expect(r.groupByFieldRefs).toEqual(['class']);
    });

    it('falls back to the single enum field when groupBy is missing', () => {
      const r = parseFull({
        title: 'PT conferences',
        fields: [
          { ref: 'class', label: 'Class', fieldType: 'enum', choices: ['Maple', 'Cedar'] },
          { ref: 'time', label: 'Time', fieldType: 'time' },
        ],
        slots: [{ values: { class: 'Maple', time: '09:00' } }],
      });
      expect(r.groupByFieldRefs).toEqual(['class']);
    });

    it('does not group when there are multiple enum fields and no hint', () => {
      const r = parseFull({
        title: 'My signup',
        fields: [
          { ref: 'class', label: 'Class', fieldType: 'enum', choices: ['Maple'] },
          { ref: 'station', label: 'Station', fieldType: 'enum', choices: ['A'] },
        ],
        slots: [{ values: { class: 'Maple', station: 'A' } }],
      });
      expect(r.groupByFieldRefs).toEqual([]);
    });

    it('ignores a groupBy ref that does not match any declared field', () => {
      const r = parseFull({
        title: 'My signup',
        groupBy: 'nonexistent',
        fields: [{ ref: 'a', label: 'A', fieldType: 'text' }],
        slots: [{ values: { a: 'hi' } }],
      });
      expect(r.groupByFieldRefs).toEqual([]);
    });
  });

  describe('dropped telemetry', () => {
    it('records duplicate refs after the first occurrence', () => {
      const r = parseFull({
        title: 'My signup',
        fields: [
          { ref: 'date', label: 'Date one', fieldType: 'date' },
          { ref: 'date', label: 'Date two', fieldType: 'text' },
        ],
        slots: [{ values: { date: '2026-04-25' } }],
      });
      expect(r.dropped.duplicateRefs).toEqual(['date']);
      expect(r.dropped.strayValueKeys).toEqual([]);
      expect(r.dropped.coercionFailures).toEqual([]);
    });

    it('records stray value keys that have no matching field', () => {
      const r = parseFull({
        title: 'My signup',
        fields: [{ ref: 'date', label: 'Date', fieldType: 'date' }],
        slots: [{ values: { date: '2026-04-25', typo: 'nope' } }],
      });
      expect(r.dropped.strayValueKeys).toEqual(['typo']);
      expect(r.dropped.duplicateRefs).toEqual([]);
    });

    it('records coercion failures for malformed values', () => {
      const r = parseFull({
        title: 'My signup',
        fields: [
          { ref: 'date', label: 'Date', fieldType: 'date' },
          { ref: 'time', label: 'Time', fieldType: 'time' },
        ],
        slots: [{ values: { date: '04/25/2026', time: '25:00' } }],
      });
      expect(r.dropped.coercionFailures).toEqual([
        { slot: 0, ref: 'date', reason: 'date' },
        { slot: 0, ref: 'time', reason: 'time' },
      ]);
    });

    it('returns empty dropped summary for a clean draft', () => {
      const r = parseFull({
        title: 'My signup',
        fields: [{ ref: 'date', label: 'Date', fieldType: 'date' }],
        slots: [{ values: { date: '2026-04-25' } }],
      });
      expect(r.dropped.duplicateRefs).toEqual([]);
      expect(r.dropped.strayValueKeys).toEqual([]);
      expect(r.dropped.coercionFailures).toEqual([]);
      expect(r.dropped.emptyEnumFields).toEqual([]);
    });

    it('demotes an enum field with no choices to free text and records it', () => {
      const r = parseFull({
        title: 'My signup',
        fields: [
          { ref: 'role', label: 'Role', fieldType: 'enum' },
          { ref: 'station', label: 'Station', fieldType: 'enum', choices: ['  ', ' '] },
        ],
        slots: [{ values: { role: 'Driver', station: 'A' } }],
      });
      expect(r.dropped.emptyEnumFields).toEqual(['role', 'station']);
      expect(r.template.fields[0]?.fieldType).toBe('text');
      expect(r.template.fields[1]?.fieldType).toBe('text');
      // The slot values pass through as text now rather than coerce-failing.
      expect(r.template.slots[0]?.values).toEqual({ role: 'Driver', station: 'A' });
    });
  });
});

describe('buildWarnings', () => {
  it('returns nothing for a clean conversion', () => {
    expect(
      buildWarnings({
        duplicateRefs: [],
        strayValueKeys: [],
        coercionFailures: [],
        emptyEnumFields: [],
      }),
    ).toEqual([]);
  });

  it('surfaces coercion failures with cell counts', () => {
    const out = buildWarnings({
      duplicateRefs: [],
      strayValueKeys: [],
      coercionFailures: [{ slot: 0, ref: 'date', reason: 'date' }],
      emptyEnumFields: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/cell was left blank/);
  });

  it('describes a demoted enum field by ref', () => {
    const out = buildWarnings({
      duplicateRefs: [],
      strayValueKeys: [],
      coercionFailures: [],
      emptyEnumFields: ['role'],
    });
    expect(out[0]).toMatch(/role/);
    expect(out[0]).toMatch(/free text/);
  });

  it('concatenates multiple categories of warning', () => {
    const out = buildWarnings({
      duplicateRefs: ['date'],
      strayValueKeys: ['typo'],
      coercionFailures: [
        { slot: 0, ref: 'date', reason: 'date' },
        { slot: 1, ref: 'time', reason: 'time' },
      ],
      emptyEnumFields: ['role'],
    });
    expect(out).toHaveLength(4);
  });
});
