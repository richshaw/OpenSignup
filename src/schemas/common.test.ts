import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { describe, expect, it } from 'vitest';
import { NAME_MAX_LENGTH } from '@/lib/participant-limits';
import { boundedArray, EmailSchema, NameSchema, normalizeEmail } from './common';

describe('EmailSchema', () => {
  it('trims whitespace and lowercases', () => {
    expect(EmailSchema.parse('  Foo@Bar.Test ')).toBe('foo@bar.test');
  });

  it('rejects invalid addresses', () => {
    expect(() => EmailSchema.parse('not-an-email')).toThrow();
  });

  it('rejects addresses over 254 characters', () => {
    const local = 'a'.repeat(250);
    expect(() => EmailSchema.parse(`${local}@x.test`)).toThrow();
  });
});

describe('normalizeEmail', () => {
  it('produces the same output as EmailSchema for valid input', () => {
    const input = '  Foo@Bar.Test ';
    expect(normalizeEmail(input)).toBe(EmailSchema.parse(input));
  });
});

describe('NameSchema', () => {
  it('trims a name', () => {
    expect(NameSchema.parse('  Pat Example ')).toBe('Pat Example');
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['only whitespace', ' \t\n '],
  ])('refuses an %s name', (_label, name) => {
    expect(NameSchema.safeParse(name).success).toBe(false);
  });

  it('refuses a name over the limit', () => {
    // The literal keeps a typo in the public constant observable here.
    expect(NAME_MAX_LENGTH).toBe(100);
    expect(NameSchema.safeParse('a'.repeat(101)).success).toBe(false);
    expect(NameSchema.safeParse('a'.repeat(100)).success).toBe(true);
  });
});

describe('boundedArray', () => {
  const Ids = boundedArray(z.string(), { min: 1, max: 3 });

  it('takes an array within its bounds', () => {
    expect(Ids.parse(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('refuses a too-long array as .max() does, parsing only its first max items', () => {
    const result = Ids.safeParse(Array.from({ length: 10_000 }, () => 0));
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: 'too_big',
        maximum: 3,
        type: 'array',
        inclusive: true,
        exact: false,
        path: [],
        message: expect.any(String),
      },
      expect.objectContaining({ code: 'invalid_type', path: [0] }),
      expect.objectContaining({ code: 'invalid_type', path: [1] }),
      expect.objectContaining({ code: 'invalid_type', path: [2] }),
    ]);
  });

  it('gives the same too_big issue as .max()', () => {
    const tooLong = ['a', 'b', 'c', 'd'];
    expect(Ids.safeParse(tooLong).error?.issues).toEqual(
      z.array(z.string()).max(3).safeParse(tooLong).error?.issues,
    );
  });

  it('still runs the checks of the object around it', () => {
    const Outer = z
      .object({ ids: Ids, n: z.number() })
      .refine((o) => o.n > 0, { message: 'n must be positive', path: ['n'] });
    const messages = Outer.safeParse({ ids: ['a', 'b', 'c', 'd'], n: 0 }).error?.issues.map(
      (i) => i.message,
    );
    expect(messages).toContain('n must be positive');
  });

  it('still reports each bad item in an array within its bounds', () => {
    const result = Ids.safeParse(['a', 1, 2]);
    expect(result.error?.issues.map((i) => i.path)).toEqual([[1], [2]]);
  });

  it('still refuses a too-short array and a value that is not an array', () => {
    expect(Ids.safeParse([]).error?.issues[0]?.code).toBe('too_small');
    expect(Ids.safeParse('a').error?.issues[0]?.code).toBe('invalid_type');
  });

  it('gives an object field the path of that field', () => {
    const result = z.object({ ids: Ids }).safeParse({ ids: ['a', 'b', 'c', 'd'] });
    expect(result.error?.issues[0]?.path).toEqual(['ids']);
  });

  it('describes itself as the plain array in JSON Schema', () => {
    expect(zodToJsonSchema(Ids, { $refStrategy: 'none' })).toMatchObject({
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 3,
    });
  });
});
