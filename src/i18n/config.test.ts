import { afterEach, describe, expect, it } from 'vitest';
import {
  type Audience,
  CATALOG_LOCALES,
  type CatalogLocale,
  SHIPPED,
  defaultFor,
  isShipped,
  languageName,
  openGraphLocale,
  signupLocale,
} from './config';
import { ship } from './testing/ship';

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

describe('signupLocale', () => {
  // Only English has a catalog today. The test that needs a second one adds
  // Swedish to the list itself.
  const catalogsToday = [...CATALOG_LOCALES];
  afterEach(() => {
    (CATALOG_LOCALES as unknown as string[]).splice(0, Infinity, ...catalogsToday);
  });

  it('keeps a language that has shipped to participants', () => {
    expect(signupLocale('en', undefined)).toBe('en');
    ship('participant', ['en', 'sv']);
    expect(signupLocale('sv', undefined)).toBe('sv');
  });

  // A stored value is lenient: one that is unknown, or has since left the
  // list, must read as the instance's language rather than break the row.
  it.each([
    ['nothing stored', undefined],
    ['null', null],
    ['a language with no catalog', 'xx'],
    ['another case', 'EN'],
    ['a region', 'en-GB'],
    ['an empty string', ''],
    ['not a string', 5],
  ])('falls back for %s', (_label, value) => {
    expect(signupLocale(value, undefined)).toBe('en');
  });

  // The Settings tab's rule: a language with a catalog that hasn't shipped
  // (yet, or any more) isn't the signup's language, so the page doesn't use
  // one the organizer can't see chosen.
  it('falls back for a language that has a catalog but has not shipped', () => {
    (CATALOG_LOCALES as unknown as string[]).push('sv');
    expect(signupLocale('sv', undefined)).toBe('en');
  });

  it('falls back to the instance language once it has shipped to participants', () => {
    const sv = 'sv' as CatalogLocale;
    // Set before it ships: English, as `defaultFor` says.
    expect(signupLocale(undefined, sv)).toBe('en');
    ship('participant', ['en', 'sv']);
    expect(signupLocale(undefined, sv)).toBe('sv');
    expect(signupLocale('xx', sv)).toBe('sv');
    expect(signupLocale('en', sv)).toBe('en');
  });
});

describe('openGraphLocale', () => {
  it('names a language with the region link previews expect', () => {
    expect(openGraphLocale('en')).toBe('en_US');
    // Swedish has no catalog yet, hence the cast.
    expect(openGraphLocale('sv' as CatalogLocale)).toBe('sv_SE');
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

describe('languageName', () => {
  it('names a language in itself', () => {
    expect(languageName('en')).toBe('English');
  });

  it('starts with a capital where CLDR writes the name in lower case', () => {
    // CLDR has "svenska". Swedish has no catalog yet, hence the cast.
    expect(languageName('sv' as CatalogLocale)).toBe('Svenska');
  });
});
