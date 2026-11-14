import { describe, expect, it } from 'vitest';
import {
  type Audience,
  CATALOG_LOCALES,
  type CatalogLocale,
  SHIPPED,
  defaultFor,
  isShipped,
  resolveLocale,
} from './config';

describe('SHIPPED', () => {
  it('ships English to every audience, since English fills every gap', () => {
    for (const locales of Object.values(SHIPPED)) {
      expect(locales).toContain('en');
    }
  });

  it('ships only languages that have a catalog', () => {
    for (const locales of Object.values(SHIPPED)) {
      for (const locale of locales) expect(CATALOG_LOCALES).toContain(locale);
    }
  });
});

describe('isShipped', () => {
  it('takes a language shipped to the audience', () => {
    expect(isShipped('participant', 'en')).toBe(true);
  });

  it.each([
    ['a language with no catalog', 'xx'],
    ['another case of a shipped one', 'EN'],
    ['a region of a shipped one', 'en-GB'],
    ['nothing', undefined],
    ['an empty string', ''],
    ['a number', 5],
  ])('refuses %s', (_label, value) => {
    expect(isShipped('participant', value)).toBe(false);
  });
});

describe('resolveLocale', () => {
  it('keeps a language that has a catalog', () => {
    expect(resolveLocale('en', 'en')).toBe('en');
  });

  // A stored value is lenient: one that is unknown, or has since lost its
  // catalog, must read as the fallback rather than break the row.
  it.each([
    ['nothing stored', undefined],
    ['null', null],
    ['a language with no catalog', 'xx'],
    ['another case', 'EN'],
    ['a region', 'en-GB'],
    ['an empty string', ''],
    ['not a string', 5],
  ])('falls back for %s', (_label, value) => {
    expect(resolveLocale(value, 'en')).toBe('en');
  });

  it('returns the fallback it is given', () => {
    // Every catalog language is a valid fallback, today only English.
    for (const fallback of CATALOG_LOCALES) {
      expect(resolveLocale('xx', fallback)).toBe(fallback);
    }
  });
});

describe('defaultFor', () => {
  const audiences = Object.keys(SHIPPED) as Audience[];

  it.each(audiences)('is English for %s when the instance sets no language', (audience) => {
    expect(defaultFor(audience, undefined)).toBe('en');
  });

  it.each(audiences)('is the instance language for %s when it ships there', (audience) => {
    for (const locale of SHIPPED[audience]) expect(defaultFor(audience, locale)).toBe(locale);
  });

  // An operator who sets a language before it ships to an audience gets
  // English there, not half-translated pages.
  it.each(audiences)(
    'is English for %s when the instance language has not shipped there',
    (audience) => {
      // Stands in for a catalog language that hasn't shipped to anyone yet.
      const unshipped = 'zz' as CatalogLocale;
      expect(defaultFor(audience, unshipped)).toBe('en');
    },
  );
});
