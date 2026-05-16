import { describe, expect, it } from 'vitest';
import {
  MagicComposeDraftSchema,
  MAX_FIELDS,
  MAX_SLOTS,
  RESPONSE_JSON_SCHEMA,
  buildMessages,
  getSystemPromptForTests,
} from './prompt';

describe('system prompt', () => {
  const sys = getSystemPromptForTests();

  it('lists the closed fieldType enum', () => {
    expect(sys).toContain('text, date, time, number, enum');
  });

  it('contains the "slots are the atom" rule', () => {
    expect(sys.toLowerCase()).toContain('slots are the atom');
  });

  it('forbids personal-data slot fields', () => {
    expect(sys.toLowerCase()).toMatch(/social security|government id|date of birth/);
  });

  it('forbids inventing dates / capacities', () => {
    expect(sys.toLowerCase()).toMatch(/never invent dates/);
  });

  it('specifies kebab-case refs', () => {
    expect(sys.toLowerCase()).toMatch(/kebab/);
  });

  it('forbids emitting IDs/slugs/status', () => {
    expect(sys).toMatch(/sig_/);
    expect(sys.toLowerCase()).toMatch(/status/);
  });

  it('caps fields and slots', () => {
    expect(sys).toContain(String(MAX_FIELDS));
    expect(sys).toContain(String(MAX_SLOTS));
  });

  it('describes the structured refusal pattern', () => {
    expect(sys).toContain('refusalReason');
  });

});

describe('buildMessages', () => {
  it('returns a system + user pair', () => {
    const out = buildMessages('hello world');
    expect(out).toHaveLength(2);
    expect(out[0]?.role).toBe('system');
    expect(out[1]).toEqual({ role: 'user', content: 'hello world' });
  });

  it("injects today's date into the system prompt", () => {
    const out = buildMessages('hello', new Date('2026-05-15T12:00:00Z'));
    expect(out[0]?.content).toContain("Today's date is 2026-05-15");
  });
});

describe('MagicComposeDraftSchema', () => {
  const valid = {
    title: 'U9 snack duty',
    description: 'Saturdays in spring.',
    fields: [
      { ref: 'date', label: 'Date', fieldType: 'date', required: true },
      { ref: 'opponent', label: 'Opponent', fieldType: 'text' },
    ],
    slots: [{ values: { date: '2026-04-25', opponent: 'Hawks' }, capacity: 2 }],
  };

  it('accepts a well-formed draft', () => {
    const r = MagicComposeDraftSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejects an out-of-enum fieldType', () => {
    const r = MagicComposeDraftSchema.safeParse({
      ...valid,
      fields: [{ ref: 'essay', label: 'Essay', fieldType: 'essay' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-kebab refs', () => {
    const r = MagicComposeDraftSchema.safeParse({
      ...valid,
      fields: [{ ref: 'CamelCase', label: 'X', fieldType: 'text' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects too many fields', () => {
    const fields = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({
      ref: `f-${i}`,
      label: `F${i}`,
      fieldType: 'text' as const,
    }));
    const r = MagicComposeDraftSchema.safeParse({ ...valid, fields });
    expect(r.success).toBe(false);
  });

  it('rejects too many slots', () => {
    const slots = Array.from({ length: MAX_SLOTS + 1 }, () => ({ values: {} }));
    const r = MagicComposeDraftSchema.safeParse({ ...valid, slots });
    expect(r.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const r = MagicComposeDraftSchema.safeParse({ ...valid, title: '' });
    expect(r.success).toBe(false);
  });

  it('accepts a structured refusal payload (no fields or slots required)', () => {
    const r = MagicComposeDraftSchema.safeParse({
      refusalReason: 'OpenSignup does not draft data-harvesting forms.',
    });
    expect(r.success).toBe(true);
    if (r.success && 'refusalReason' in r.data) {
      expect(r.data.refusalReason).toMatch(/data-harvesting/);
    }
  });

  it('rejects a refusal with an empty refusalReason', () => {
    const r = MagicComposeDraftSchema.safeParse({ refusalReason: '' });
    expect(r.success).toBe(false);
  });
});

describe('RESPONSE_JSON_SCHEMA', () => {
  it('declares every top-level property the Zod schema accepts', () => {
    // Locks Zod ↔ JSON-Schema drift. If a new property is added to the Zod
    // schema, it must be mirrored here (or vice versa).
    const props = RESPONSE_JSON_SCHEMA.schema.properties;
    expect(props).toHaveProperty('title');
    expect(props).toHaveProperty('description');
    expect(props).toHaveProperty('fields');
    expect(props).toHaveProperty('slots');
    expect(props).toHaveProperty('groupBy');
    expect(props).toHaveProperty('refusalReason');
  });
});
