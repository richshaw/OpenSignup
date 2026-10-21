import { describe, expect, it } from 'vitest';
import { EmailSchema, NameSchema, normalizeEmail } from './common';

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

  it('refuses a name over 100 characters', () => {
    expect(NameSchema.safeParse('a'.repeat(101)).success).toBe(false);
    expect(NameSchema.safeParse('a'.repeat(100)).success).toBe(true);
  });
});
