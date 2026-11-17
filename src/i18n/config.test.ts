import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  type Audience,
  CATALOG_LOCALES,
  type CatalogLocale,
  SHIPPED,
  isShipped,
  langWhereDifferent,
  languageName,
  languageNameInSentence,
  openGraphLocale,
  resolveLocale,
} from './config';
import { ship, shipOnlyEnglish } from './testing/ship';

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

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

  it('ships each language to participants and organizers together', () => {
    expect(
      [...SHIPPED.organizer].sort(),
      'The owner decided a language launches for participants and organizers together: ' +
        'one launch adds it to SHIPPED.participant and SHIPPED.organizer. The account ' +
        'Settings picker offers the participant list, and the screens follow the organizer list.',
    ).toEqual([...SHIPPED.participant].sort());
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

const AUDIENCES = Object.keys(SHIPPED) as Audience[];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveLocale while only English has shipped', () => {
  beforeEach(shipOnlyEnglish);

  it.each(AUDIENCES)('is English for %s, from whichever step names it first', (audience) => {
    expect(resolveLocale(audience, 'en', 'en')).toEqual({ locale: 'en', source: 'setting' });
    expect(resolveLocale(audience, null, 'en')).toEqual({ locale: 'en', source: 'instance' });
    expect(resolveLocale(audience, undefined, undefined)).toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  // An operator who sets a language before it ships to an audience gets
  // English there, not half-translated pages.
  it.each(AUDIENCES)('is English for %s whatever is stored or the instance sets', (audience) => {
    for (const other of OTHER_LANGUAGES) {
      expect(resolveLocale(audience, other, other)).toEqual({ locale: 'en', source: 'default' });
      expect(resolveLocale(audience, undefined, other)).toEqual({
        locale: 'en',
        source: 'default',
      });
    }
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
  ])('passes over %s', (_label, stored) => {
    expect(resolveLocale('participant', stored, undefined)).toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  // An organizer's language is stored once, when their account is created
  // (`newOrganizerLocale`), and changed in account Settings, never worked
  // out again from a visit.
  it('has no browser step: it takes what is stored and the instance’s default, nothing else', () => {
    expectTypeOf(resolveLocale).parameters.toEqualTypeOf<
      [Audience, unknown, CatalogLocale | undefined]
    >();
  });

  // The Settings tab's rule: a language with a catalog that hasn't shipped
  // (yet, or any more) isn't the signup's language, so the page doesn't use
  // one the organizer can't see chosen.
  it.each(OTHER_LANGUAGES)('passes over %s, which has a catalog but has not shipped', (other) => {
    expect(isShipped('participant', other)).toBe(false);
    expect(resolveLocale('participant', other, undefined).locale).toBe('en');
  });
});

describe.each(OTHER_LANGUAGES)('resolveLocale once %s has shipped', (other) => {
  beforeEach(shipOnlyEnglish);

  it('takes the stored language before anything else', () => {
    ship('participant', ['en', other]);
    expect(resolveLocale('participant', other, 'en')).toEqual({
      locale: other,
      source: 'setting',
    });
    expect(resolveLocale('participant', 'en', other)).toEqual({
      locale: 'en',
      source: 'setting',
    });
  });

  it('takes the instance default next, when it is set', () => {
    ship('participant', ['en', other]);
    expect(resolveLocale('participant', null, other)).toEqual({
      locale: other,
      source: 'instance',
    });
    expect(resolveLocale('participant', 'xx', other)).toEqual({
      locale: other,
      source: 'instance',
    });
  });

  it('is English when nothing usable is stored and the instance sets no default', () => {
    ship('participant', ['en', other]);
    for (const stored of [null, undefined, 'xx', other.toUpperCase(), '', 5]) {
      expect(resolveLocale('participant', stored, undefined)).toEqual({
        locale: 'en',
        source: 'default',
      });
    }
  });

  it('passes over a stored language that has left the list', () => {
    // Stored while the language had shipped, read after it was withdrawn.
    expect(resolveLocale('participant', other, undefined)).toEqual({
      locale: 'en',
      source: 'default',
    });
    expect(resolveLocale('participant', other, other)).toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  // The two lists ship together, but each screen asks its own.
  it('checks every step against the list for the audience asked about', () => {
    ship('participant', ['en', other]);
    expect(resolveLocale('organizer', other, other)).toEqual({ locale: 'en', source: 'default' });
    expect(resolveLocale('participant', other, other)).toEqual({
      locale: other,
      source: 'setting',
    });
    ship('organizer', ['en', other]);
    ship('participant', ['en']);
    expect(resolveLocale('participant', undefined, other)).toEqual({
      locale: 'en',
      source: 'default',
    });
    expect(resolveLocale('organizer', undefined, other)).toEqual({
      locale: other,
      source: 'instance',
    });
  });

  // Only what's stored on a signup's or an account's row is ever shown in
  // a language that hasn't shipped, and only on the e2e run's server: that's
  // ./locale.ts's, never the rule's.
  it('ignores E2E_UNSHIPPED_LOCALES', () => {
    vi.stubEnv('E2E_UNSHIPPED_LOCALES', other);
    for (const audience of AUDIENCES) {
      expect(resolveLocale(audience, other, other)).toEqual({ locale: 'en', source: 'default' });
      expect(isShipped(audience, other)).toBe(false);
      expect(SHIPPED[audience]).not.toContain(other);
    }
  });
});

describe('openGraphLocale', () => {
  it('names a language with the region link previews expect', () => {
    expect(openGraphLocale('en')).toBe('en_US');
    expect(openGraphLocale('sv')).toBe('sv_SE');
  });
});

describe('langWhereDifferent', () => {
  it('marks nothing in the page’s own language', () => {
    for (const locale of CATALOG_LOCALES)
      expect(langWhereDifferent(locale, locale)).toBeUndefined();
  });

  it.each(OTHER_LANGUAGES)('marks a part in %s inside English, and English inside it', (other) => {
    expect(langWhereDifferent(other, 'en')).toBe(other);
    expect(langWhereDifferent('en', other)).toBe('en');
  });
});

describe('languageName', () => {
  it('names a language in itself', () => {
    expect(languageName('en')).toBe('English');
  });

  it('starts with a capital where CLDR writes the name in lower case', () => {
    // CLDR has "svenska".
    expect(languageName('sv')).toBe('Svenska');
  });

  it('names a language in another, as the Magic Compose prompt names one in English', () => {
    expect(languageName('sv', 'en')).toBe('Swedish');
    expect(languageName('en', 'en')).toBe('English');
    // CLDR has "engelska".
    expect(languageName('en', 'sv')).toBe('Engelska');
  });

  it('starts every catalog language’s name with a capital, for a list', () => {
    for (const locale of CATALOG_LOCALES) expect(languageName(locale)).toMatch(/^\p{Lu}/u);
  });
});

describe('languageNameInSentence', () => {
  /**
   * Each catalog language's name, in itself, inside a sentence in each
   * catalog language: `name[sentence][language]`. A new catalog language
   * needs a row and a column here, which the type asks for.
   */
  const inSentence: Record<CatalogLocale, Record<CatalogLocale, string>> = {
    // English capitalizes a language's name in a sentence, as in a list.
    en: { en: 'English', sv: 'Svenska' },
    // Swedish writes language names in lower case in a sentence ("byt till
    // svenska"), and keeps English's own capital.
    sv: { en: 'English', sv: 'svenska' },
  };

  it.each(CATALOG_LOCALES.flatMap((sentence) => CATALOG_LOCALES.map((name) => [name, sentence])))(
    'writes %s inside a sentence in %s as that language does',
    (name, sentence) => {
      expect(languageNameInSentence(name, sentence)).toBe(inSentence[sentence][name]);
    },
  );
});
