import { describe, expect, it } from 'vitest';
import { randomSuffix, toSlug } from './slug';

describe('toSlug', () => {
  it('lowercases and kebab-cases', () => {
    expect(toSlug('Team Snack — Spring!')).toBe('team-snack-spring');
  });

  it('strips diacritics', () => {
    expect(toSlug('Café du Matin')).toBe('cafe-du-matin');
  });

  it('collapses consecutive dashes', () => {
    expect(toSlug('Hello   --   World')).toBe('hello-world');
  });

  it('trims leading/trailing dashes', () => {
    expect(toSlug('!!! hello !!!')).toBe('hello');
  });

  it('falls back when input is empty', () => {
    expect(toSlug('', { suffix: true })).toMatch(/^signup-[0-9a-z]{5}$/);
  });

  it('appends a 5-char crockford suffix when requested', () => {
    const s = toSlug('Team Snack', { suffix: true });
    expect(s).toMatch(/^team-snack-[0-9a-z]{5}$/);
    // no ambiguous characters
    expect(s).not.toMatch(/[iluo]/);
  });

  it('respects maxLength', () => {
    const long = 'a'.repeat(200);
    const s = toSlug(long, { maxLength: 20 });
    expect(s.length).toBeLessThanOrEqual(20);
  });

  it('never leaves a trailing dash when truncation lands mid-word', () => {
    // Normalizes to 59 a's + '-' + 'b'; the default 60-char cut would
    // otherwise keep the separator.
    expect(toSlug('a'.repeat(59) + ' b')).toBe('a'.repeat(59));
    expect(toSlug('hello ' + 'x'.repeat(40), { maxLength: 6 })).toBe('hello');
  });

  it('honours a maxLength above the default cap', () => {
    const s = toSlug('a'.repeat(80), { maxLength: 80 });
    expect(s).toBe('a'.repeat(80));
  });
});

describe('randomSuffix', () => {
  it('has the requested length', () => {
    expect(randomSuffix(5)).toHaveLength(5);
    expect(randomSuffix(10)).toHaveLength(10);
  });

  it('only contains crockford base32 chars', () => {
    const s = randomSuffix(100);
    expect(s).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]+$/);
  });
});
