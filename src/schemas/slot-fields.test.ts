import { describe, expect, it } from 'vitest';
import {
  FIELD_TYPES,
  REF_MAX_LENGTH,
  RefSchema,
  SlotFieldConfigSchema,
  SlotFieldInputSchema,
  SlotFieldUpdateInputSchema,
  toFieldRef,
} from './slot-fields';

describe('FIELD_TYPES', () => {
  it('lists the five primitive field types', () => {
    expect([...FIELD_TYPES]).toEqual(['text', 'date', 'time', 'number', 'enum']);
  });
});

describe('SlotFieldConfigSchema', () => {
  it('accepts text config with maxLength', () => {
    expect(SlotFieldConfigSchema.parse({ fieldType: 'text', maxLength: 100 })).toEqual({
      fieldType: 'text',
      maxLength: 100,
    });
  });

  it('defaults text maxLength to 200', () => {
    const parsed = SlotFieldConfigSchema.parse({ fieldType: 'text' });
    expect(parsed).toEqual({ fieldType: 'text', maxLength: 200 });
  });

  it('rejects text maxLength exceeding 2000', () => {
    expect(() =>
      SlotFieldConfigSchema.parse({ fieldType: 'text', maxLength: 5000 }),
    ).toThrow();
  });

  it('accepts empty date config', () => {
    expect(SlotFieldConfigSchema.parse({ fieldType: 'date' })).toEqual({ fieldType: 'date' });
  });

  it('accepts empty time config', () => {
    expect(SlotFieldConfigSchema.parse({ fieldType: 'time' })).toEqual({ fieldType: 'time' });
  });

  it('accepts number config with unit and target', () => {
    expect(
      SlotFieldConfigSchema.parse({ fieldType: 'number', unit: 'lbs', target: 50 }),
    ).toEqual({ fieldType: 'number', unit: 'lbs', target: 50 });
  });

  it('accepts enum config with choices', () => {
    expect(
      SlotFieldConfigSchema.parse({ fieldType: 'enum', choices: ['A', 'B', 'C'] }),
    ).toEqual({ fieldType: 'enum', choices: ['A', 'B', 'C'] });
  });

  it('rejects enum with more than 20 choices', () => {
    const choices = Array.from({ length: 21 }, (_, i) => `choice-${i}`);
    expect(() => SlotFieldConfigSchema.parse({ fieldType: 'enum', choices })).toThrow();
  });

  it('rejects enum with empty choices', () => {
    expect(() => SlotFieldConfigSchema.parse({ fieldType: 'enum', choices: [] })).toThrow();
  });

  it('rejects enum with a choice longer than 60 chars', () => {
    const long = 'x'.repeat(61);
    expect(() =>
      SlotFieldConfigSchema.parse({ fieldType: 'enum', choices: ['ok', long] }),
    ).toThrow();
  });

  it('rejects unknown field type', () => {
    expect(() => SlotFieldConfigSchema.parse({ fieldType: 'bogus' })).toThrow();
  });
});

describe('SlotFieldInputSchema', () => {
  it('accepts a minimal text field', () => {
    const parsed = SlotFieldInputSchema.parse({
      ref: 'teacher',
      label: 'Teacher',
      fieldType: 'text',
      config: { fieldType: 'text' },
    });
    expect(parsed.ref).toBe('teacher');
    expect(parsed.label).toBe('Teacher');
    // Omitted stays undefined so addField can tell "append" from "put it first".
    expect(parsed.sortOrder).toBeUndefined();
  });

  it('accepts an enum field with choices', () => {
    const parsed = SlotFieldInputSchema.parse({
      ref: 'subject',
      label: 'Subject',
      fieldType: 'enum',
      config: { fieldType: 'enum', choices: ['Math', 'Science'] },
      sortOrder: 5,
    });
    expect(parsed.sortOrder).toBe(5);
    if (parsed.config.fieldType === 'enum') {
      expect(parsed.config.choices).toEqual(['Math', 'Science']);
    }
  });

  it('rejects mismatched fieldType vs config.fieldType', () => {
    expect(() =>
      SlotFieldInputSchema.parse({
        ref: 'x',
        label: 'X',
        fieldType: 'text',
        config: { fieldType: 'enum', choices: ['A'] },
      }),
    ).toThrow();
  });

  it('rejects ref that is not lowercase kebab', () => {
    expect(() =>
      SlotFieldInputSchema.parse({
        ref: 'Bad Ref',
        label: 'X',
        fieldType: 'text',
        config: { fieldType: 'text' },
      }),
    ).toThrow();
  });

  it('rejects ref longer than 40 chars', () => {
    expect(() =>
      SlotFieldInputSchema.parse({
        ref: 'a'.repeat(41),
        label: 'X',
        fieldType: 'text',
        config: { fieldType: 'text' },
      }),
    ).toThrow();
  });

  it('rejects label longer than 80 chars', () => {
    expect(() =>
      SlotFieldInputSchema.parse({
        ref: 'x',
        label: 'L'.repeat(81),
        fieldType: 'text',
        config: { fieldType: 'text' },
      }),
    ).toThrow();
  });

  it('rejects empty label', () => {
    expect(() =>
      SlotFieldInputSchema.parse({
        ref: 'x',
        label: '',
        fieldType: 'text',
        config: { fieldType: 'text' },
      }),
    ).toThrow();
  });
});

describe('SlotFieldUpdateInputSchema', () => {
  it('accepts label-only update', () => {
    const parsed = SlotFieldUpdateInputSchema.parse({ label: 'New Label' });
    expect(parsed.label).toBe('New Label');
  });

  it('accepts sortOrder + config update', () => {
    const parsed = SlotFieldUpdateInputSchema.parse({
      sortOrder: 10,
      fieldType: 'text',
      config: { fieldType: 'text', maxLength: 50 },
    });
    expect(parsed.sortOrder).toBe(10);
  });

  it('rejects ref in update payload (ref is immutable)', () => {
    expect(() => SlotFieldUpdateInputSchema.parse({ ref: 'newref' })).toThrow();
  });
});

describe('toFieldRef', () => {
  it('kebab-cases a short name', () => {
    expect(toFieldRef('Café du Matin', [])).toBe('cafe-du-matin');
  });

  it('cuts a long name to a ref RefSchema accepts', () => {
    const ref = toFieldRef('Preferred contact time for the volunteer team', []);
    expect(ref).toBe('preferred-contact-time-for-the-volunteer');
    expect(RefSchema.safeParse(ref).success).toBe(true);
  });

  it('does not end on a hyphen when the cut lands on one', () => {
    // The first 40 characters end on the hyphen after "snacks".
    const ref = toFieldRef('Name of the person who will bring snacks to the party', []);
    expect(ref).toBe('name-of-the-person-who-will-bring-snacks');
    expect(RefSchema.safeParse(ref).success).toBe(true);
  });

  it('falls back to "field" when the name has no letters or digits', () => {
    expect(toFieldRef('!!!', [])).toBe('field');
  });

  it('numbers a taken ref', () => {
    expect(toFieldRef('Dish', ['dish', 'dish-2'])).toBe('dish-3');
  });

  it('keeps a numbered ref within the limit when the base is already full length', () => {
    const name = 'a'.repeat(REF_MAX_LENGTH);
    const ref = toFieldRef(name, [name]);
    expect(ref).toBe(`${'a'.repeat(REF_MAX_LENGTH - 2)}-2`);
    expect(RefSchema.safeParse(ref).success).toBe(true);
  });

  it('does not leave a hyphen before the number when the shortened base ends on one', () => {
    const name = `${'a'.repeat(37)} bc`;
    const ref = toFieldRef(name, [toFieldRef(name, [])]);
    expect(ref).toBe(`${'a'.repeat(37)}-2`);
    expect(RefSchema.safeParse(ref).success).toBe(true);
  });

  it('gives a ref RefSchema accepts for any name a field may have', () => {
    const names = [
      'Dish you plan to bring to the potluck dinner',
      'x'.repeat(80),
      `${'ab '.repeat(26)}ab`,
      '  — ',
    ];
    for (const name of names) {
      const first = toFieldRef(name, []);
      const second = toFieldRef(name, [first]);
      expect(RefSchema.safeParse(first).success).toBe(true);
      expect(RefSchema.safeParse(second).success).toBe(true);
      expect(second).not.toBe(first);
    }
  });
});
