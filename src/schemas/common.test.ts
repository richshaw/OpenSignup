import { describe, expect, it } from 'vitest';
import { EmailSchema, normalizeEmail } from './common';

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
