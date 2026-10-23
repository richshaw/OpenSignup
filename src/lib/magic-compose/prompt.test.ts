import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULES_IN_BOTH } from '@/lib/signup-rules';
import { SignupCreateInputSchema } from '@/schemas/signups';
import { SlotFieldInputSchema } from '@/schemas/slot-fields';
import {
  DraftFieldSchema,
  FullDraftSchema,
  MagicComposeDraftSchema,
  MAX_FIELDS,
  MAX_SLOTS,
  buildMessages,
} from './prompt';

describe('system prompt', () => {
  const sys = buildMessages('x')[0]!.content;

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

  it('carries every rule it shares with the MCP server instructions, word for word', () => {
    for (const rule of RULES_IN_BOTH) expect(sys).toContain(rule);
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

  // Characterization: the prompt is tuned against evals, so any refactor of
  // how it is assembled must leave the bytes the model reads unchanged.
  // A plain read, not a file snapshot: `vitest -u` cannot rewrite it and a missing file fails.
  // Changing the prompt on purpose: write the new render over the golden yourself, and only
  // after an eval run (`pnpm eval:magic-compose`) says the new wording is no worse.
  it('renders the system prompt byte for byte as the golden file has it', () => {
    const out = buildMessages('x', new Date('2026-05-15T00:00:00Z'));
    const golden = readFileSync(path.join(__dirname, '__golden__/system-prompt.txt'), 'utf8');
    expect(out[0]?.content).toBe(golden);
  });
});

describe('MagicComposeDraftSchema', () => {
  const valid = {
    title: 'U9 snack duty',
    description: 'Saturdays in spring.',
    fields: [
      { ref: 'date', label: 'Date', fieldType: 'date' },
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

describe('draft limits', () => {
  // The draft is the input of Magic Compose and of the MCP create_signup and
  // add_field tools, so it must refuse exactly what the services refuse.
  const lengths = Array.from({ length: 2100 }, (_, n) => n);
  const accepts = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
    schema.safeParse(v).success;

  it('takes field labels of the same lengths as a slot field', () => {
    for (const n of lengths.slice(0, 200)) {
      const label = 'a'.repeat(n);
      expect(accepts(DraftFieldSchema, { ref: 'x', label, fieldType: 'text' }), `label ${n}`).toBe(
        accepts(SlotFieldInputSchema, {
          ref: 'x',
          label,
          fieldType: 'text',
          config: { fieldType: 'text' },
        }),
      );
    }
  });

  it('takes the same refs as a slot field', () => {
    for (const ref of ['', 'a', 'a-b', 'A', 'a_b', '-a', 'a--b', 'a'.repeat(40), 'a'.repeat(41)]) {
      expect(accepts(DraftFieldSchema, { ref, label: 'X', fieldType: 'text' }), `ref ${ref}`).toBe(
        accepts(SlotFieldInputSchema, {
          ref,
          label: 'X',
          fieldType: 'text',
          config: { fieldType: 'text' },
        }),
      );
    }
  });

  it('takes the same choices as an enum field, apart from allowing none', () => {
    const enumField = (choices: string[]) => ({
      ref: 'x',
      label: 'X',
      fieldType: 'enum' as const,
      config: { fieldType: 'enum' as const, choices },
    });
    for (const n of lengths.slice(0, 100)) {
      const choices = ['a'.repeat(n)];
      expect(accepts(DraftFieldSchema, { ...enumField(choices), choices }), `choice ${n}`).toBe(
        accepts(SlotFieldInputSchema, enumField(choices)),
      );
    }
    for (const n of lengths.slice(1, 40)) {
      const choices = Array.from({ length: n }, (_, i) => `c${i}`);
      expect(accepts(DraftFieldSchema, { ...enumField(choices), choices }), `${n} choices`).toBe(
        accepts(SlotFieldInputSchema, enumField(choices)),
      );
    }
  });

  it('takes titles and descriptions of the same lengths as a new signup', () => {
    const draft = {
      title: 'Snack duty',
      fields: [{ ref: 'x', label: 'X', fieldType: 'text' }],
      slots: [{ values: {} }],
    };
    for (const n of lengths.slice(0, 200)) {
      const title = 'a'.repeat(n);
      expect(accepts(FullDraftSchema, { ...draft, title }), `title ${n}`).toBe(
        accepts(SignupCreateInputSchema, { title }),
      );
    }
    for (const n of lengths) {
      const description = 'a'.repeat(n);
      expect(accepts(FullDraftSchema, { ...draft, description }), `description ${n}`).toBe(
        accepts(SignupCreateInputSchema, { title: 'Snack duty', description }),
      );
    }
  });
});
