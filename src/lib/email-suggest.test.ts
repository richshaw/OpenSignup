import { describe, expect, it } from 'vitest';
import { suggestEmail } from './email-suggest';

describe('suggestEmail', () => {
  it('suggests gmail.com for gmial.com', () => {
    expect(suggestEmail('test@gmial.com')).toBe('test@gmail.com');
  });

  it('suggests yahoo.com for yaho.com', () => {
    expect(suggestEmail('test@yaho.com')).toBe('test@yahoo.com');
  });

  it('suggests outlook.com for outllok.com', () => {
    expect(suggestEmail('test@outllok.com')).toBe('test@outlook.com');
  });

  it('returns null for known-good addresses', () => {
    expect(suggestEmail('a@gmail.com')).toBeNull();
    expect(suggestEmail('a@icloud.com')).toBeNull();
  });

  it('returns null when domain is too different', () => {
    expect(suggestEmail('a@my-domain.com')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(suggestEmail('nope')).toBeNull();
  });
});
