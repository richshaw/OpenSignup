import { describe, expect, it } from 'vitest';
import { slugBase, toSlug } from './slug';

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

  it('caps the base at 60 characters', () => {
    expect(toSlug('a'.repeat(200))).toHaveLength(60);
  });

  it('does not leave a trailing dash when the cap lands on a separator', () => {
    const s = toSlug(`${'a'.repeat(59)} bbbbb`);
    expect(s).toBe('a'.repeat(59));
  });

  it('keeps the slugs it has always made', () => {
    expect(toSlug('Spring Bake Sale 2026')).toBe('spring-bake-sale-2026');
    expect(toSlug('Crèche rota — Été / Hiver')).toBe('creche-rota-ete-hiver');
    expect(toSlug("Coach's corner: snacks & drinks!")).toBe('coach-s-corner-snacks-drinks');
    expect(toSlug('   ')).toBe('signup');
    expect(toSlug('Volunteers needed for the end of season tournament and awards evening')).toBe(
      'volunteers-needed-for-the-end-of-season-tournament-and-award',
    );
  });
});

describe('the suffix', () => {
  it('only uses crockford base32 characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(toSlug('x', { suffix: true })).toMatch(/^x-[0-9abcdefghjkmnpqrstvwxyz]{5}$/);
    }
  });
});

describe('slugBase', () => {
  it('drops the suffix toSlug added', () => {
    const slug = toSlug('Bake sale', { suffix: true });
    expect(slugBase(slug)).toBe('bake-sale');
  });

  it('gives the base toSlug makes without a suffix, for a long title', () => {
    const title = 'A very long title '.repeat(10);
    expect(slugBase(toSlug(title, { suffix: true }))).toBe(toSlug(title));
  });

  it('leaves a slug without a suffix as it is', () => {
    expect(slugBase('bake-sale')).toBe('bake-sale');
    expect(slugBase('team-potluck')).toBe('team-potluck');
  });

  it('does not take a final word that has letters outside the suffix alphabet', () => {
    // "lunch" has a "u", which Crockford base32 leaves out.
    expect(slugBase('school-lunch')).toBe('school-lunch');
  });
});
