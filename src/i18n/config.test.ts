import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type Audience,
  CATALOG_LOCALES,
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
  afterEach(() => {
    vi.unstubAllEnvs();
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
    expect(CATALOG_LOCALES).toContain('sv');
    expect(isShipped('participant', 'sv')).toBe(false);
    expect(signupLocale('sv', undefined)).toBe('en');
  });

  it('falls back to the instance language once it has shipped to participants', () => {
    // Set before it ships: English, as `defaultFor` says.
    expect(signupLocale(undefined, 'sv')).toBe('en');
    ship('participant', ['en', 'sv']);
    expect(signupLocale(undefined, 'sv')).toBe('sv');
    expect(signupLocale('xx', 'sv')).toBe('sv');
    expect(signupLocale('en', 'sv')).toBe('en');
  });

  describe('on the e2e run’s server (E2E_UNSHIPPED_LOCALES)', () => {
    it('keeps a stored language that has a catalog and is listed, though it hasn’t shipped', () => {
      vi.stubEnv('E2E_UNSHIPPED_LOCALES', 'sv');
      expect(signupLocale('sv', undefined)).toBe('sv');
      vi.stubEnv('E2E_UNSHIPPED_LOCALES', 'de,sv');
      expect(signupLocale('sv', undefined)).toBe('sv');
    });

    it.each([
      ['a language that isn’t listed', 'sv', 'de'],
      ['a language with no catalog', 'xx', 'xx'],
      ['another case', 'SV', 'sv'],
      ['a region', 'sv-SE', 'sv'],
      ['an empty list', 'sv', ''],
    ])('falls back for %s', (_label, stored, listed) => {
      vi.stubEnv('E2E_UNSHIPPED_LOCALES', listed);
      expect(signupLocale(stored, undefined)).toBe('en');
    });

    // What a real instance could do with it: nothing, since it only keeps a
    // language already stored, and nothing in the app stores one that hasn't
    // shipped (services/signups.ts's `checkSignupLocale`, tested there).
    it('ships nothing: no instance default, and nothing to choose', () => {
      vi.stubEnv('E2E_UNSHIPPED_LOCALES', 'sv');
      expect(signupLocale(undefined, 'sv')).toBe('en');
      expect(defaultFor('participant', 'sv')).toBe('en');
      for (const audience of Object.keys(SHIPPED) as Audience[]) {
        expect(isShipped(audience, 'sv')).toBe(false);
        expect(SHIPPED[audience]).not.toContain('sv');
      }
    });
  });
});

describe('openGraphLocale', () => {
  it('names a language with the region link previews expect', () => {
    expect(openGraphLocale('en')).toBe('en_US');
    expect(openGraphLocale('sv')).toBe('sv_SE');
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
      // Swedish has a catalog, and has shipped to no one yet: what
      // DEFAULT_LOCALE=sv gives today.
      expect(defaultFor(audience, 'sv')).toBe('en');
    },
  );
});

describe('languageName', () => {
  it('names a language in itself', () => {
    expect(languageName('en')).toBe('English');
  });

  it('starts with a capital where CLDR writes the name in lower case', () => {
    // CLDR has "svenska".
    expect(languageName('sv')).toBe('Svenska');
  });
});
