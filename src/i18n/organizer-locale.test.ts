import { describe, expect, expectTypeOf, it } from 'vitest';
import { CATALOG_LOCALES } from './config';
import { chooseOrganizerLocale, newOrganizerLocale } from './organizer-locale';
import { ship } from './testing/ship';

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

type Input = Parameters<typeof chooseOrganizerLocale>[0];
const NOTHING: Input = { audience: 'participant', saved: null, instanceDefault: undefined };
const choose = (input: Partial<Input>) => chooseOrganizerLocale({ ...NOTHING, ...input });

describe('chooseOrganizerLocale while only English has shipped', () => {
  it('is English, from whichever step names it first', () => {
    expect(choose({ saved: 'en', instanceDefault: 'en' })).toEqual({
      locale: 'en',
      source: 'setting',
    });
    expect(choose({ instanceDefault: 'en' })).toEqual({ locale: 'en', source: 'instance' });
    expect(choose({})).toEqual({ locale: 'en', source: 'default' });
  });

  it.each(OTHER_LANGUAGES)('is English for an organizer who stored %s', (other) => {
    expect(choose({ saved: other, instanceDefault: other })).toEqual({
      locale: 'en',
      source: 'default',
    });
  });
});

describe.each(OTHER_LANGUAGES)(
  'chooseOrganizerLocale once %s has shipped to participants',
  (other) => {
    it('takes the stored language before anything else', () => {
      ship('participant', ['en', other]);
      expect(choose({ saved: other, instanceDefault: 'en' })).toEqual({
        locale: other,
        source: 'setting',
      });
      expect(choose({ saved: 'en', instanceDefault: other })).toEqual({
        locale: 'en',
        source: 'setting',
      });
    });

    it('takes the instance default next, when it is set', () => {
      ship('participant', ['en', other]);
      expect(choose({ instanceDefault: other })).toEqual({ locale: other, source: 'instance' });
    });

    it('is English when nothing is stored and the instance sets no default', () => {
      ship('participant', ['en', other]);
      expect(choose({})).toEqual({ locale: 'en', source: 'default' });
    });

    it('has no browser step: a request’s language changes nothing', () => {
      ship('participant', ['en', other]);
      expectTypeOf<Input>().not.toHaveProperty('acceptLanguage');
      // Even handed one, it reads only what's stored and the instance's.
      const withHeader = { ...NOTHING, acceptLanguage: other } as Input;
      expect(chooseOrganizerLocale(withHeader)).toEqual({ locale: 'en', source: 'default' });
    });

    it('passes over a stored language that has left the list', () => {
      // Stored while the language had shipped, read after it was withdrawn.
      expect(choose({ saved: other })).toEqual({ locale: 'en', source: 'default' });
      expect(choose({ saved: other, instanceDefault: other })).toEqual({
        locale: 'en',
        source: 'default',
      });
      // And one that never had a catalog.
      ship('participant', ['en', other]);
      expect(choose({ saved: 'xx', instanceDefault: other })).toEqual({
        locale: other,
        source: 'instance',
      });
    });

    it('checks every step against the list for the audience asked about', () => {
      ship('participant', ['en', other]);
      const input = { saved: other, instanceDefault: other };
      expect(choose({ ...input, audience: 'organizer' })).toEqual({
        locale: 'en',
        source: 'default',
      });
      expect(choose({ ...input, audience: 'participant' })).toEqual({
        locale: other,
        source: 'setting',
      });
    });

    it('passes over an instance default that has not shipped to the audience', () => {
      ship('organizer', ['en', other]);
      expect(choose({ instanceDefault: other })).toEqual({ locale: 'en', source: 'default' });
    });
  },
);

describe('newOrganizerLocale while only English has shipped', () => {
  it.each<[string, string | null]>([
    ['an English browser', 'en'],
    ['a regional English browser', 'en-GB'],
    ...OTHER_LANGUAGES.map((other): [string, string] => [
      `a browser asking for ${other} first`,
      `${other},en;q=0.8`,
    ]),
    ['no header', null],
  ])('stores nothing for %s', (_label, header) => {
    expect(newOrganizerLocale(header)).toBeNull();
  });

  it.each(OTHER_LANGUAGES)('stores nothing while %s has shipped only to organizers', (other) => {
    ship('organizer', ['en', other]);
    expect(newOrganizerLocale(other)).toBeNull();
  });
});

describe.each(OTHER_LANGUAGES)(
  'newOrganizerLocale once %s has shipped to participants',
  (other) => {
    const read = (header: string | null) => {
      ship('participant', ['en', other]);
      return newOrganizerLocale(header);
    };

    it('stores the browser’s top language when it has shipped, English included', () => {
      expect(read(other)).toBe(other);
      expect(read(`${other},en;q=0.8`)).toBe(other);
      expect(read(`en,${other};q=0.8`)).toBe('en');
      expect(read('en-US')).toBe('en');
    });

    it('stores nothing with no header, as for a request from no browser', () => {
      expect(read(null)).toBeNull();
    });

    it.each([
      ['a region', (l: string) => `${l}-SE`],
      ['a region in other cases', (l: string) => `${l.toUpperCase()}-se`],
      ['a script and a region', (l: string) => `${l}-Latn-SE`],
      ['a higher weight listed later', (l: string) => `en;q=0.5, ${l}`],
      ['two weights', (l: string) => `en;q=0.5,${l};q=0.9`],
      ['a tie, by the first listed', (l: string) => `${l};q=0.8, en;q=0.8`],
      ['a weight of 1 written out', (l: string) => `${l};q=1.000, en`],
      ['an upper-case Q', (l: string) => `en;Q=0.5, ${l};Q=0.6`],
      ['spaces around each part', (l: string) => ` ${l}-SE ; q=0.9 , en ; q=0.8 `],
      ['a language refused with q=0 ahead of it', (l: string) => `en;q=0, ${l};q=0.5`],
      ['the wildcard ranked below it', (l: string) => `${l}, *;q=0.5`],
      ['an unreadable entry ahead of it', (l: string) => `en;q=2, ${l};q=0.5`],
    ])('takes the language from %s', (_label, header) => {
      expect(read(header(other))).toBe(other);
    });

    it.each([
      ['a language that has not shipped, ahead of it', (l: string) => `zz, ${l};q=0.9`],
      ['a regional one that has not shipped', (l: string) => `zz-ZZ, ${l}-SE;q=0.9`],
      ['a language that has not shipped, ahead of English', () => 'zz,en;q=0.8'],
      ['the wildcard ranked first', (l: string) => `*, ${l};q=0.5`],
      ['the wildcard alone', () => '*'],
      ['only a refusal', (l: string) => `${l};q=0`],
    ])('stores nothing for %s', (_label, header) => {
      expect(read(header(other))).toBeNull();
    });

    it.each([
      ['nothing', () => ''],
      ['spaces', () => '   '],
      ['empty entries', () => ',,;,'],
      ['a weight with no range', () => ';q=1'],
      ['an underscore for the hyphen', (l: string) => `${l}_SE`],
      ['digits for a language', () => '12'],
      ['a blank weight', (l: string) => `${l};q=`],
      ['a word for a weight', (l: string) => `${l};q=abc`],
      ['a weight over 1', (l: string) => `${l};q=1.5`],
      ['a negative weight', (l: string) => `${l};q=-1`],
      ['four decimals', (l: string) => `${l};q=0.5555`],
      ['two weights on one range', (l: string) => `${l};q=0.5;q=0.6`],
      ['another parameter', (l: string) => `${l};level=1`],
      ['a trailing semicolon', (l: string) => `${l};`],
      ['a trailing hyphen', (l: string) => `${l}-`],
      ['a leading hyphen', (l: string) => `-${l}`],
      ['an empty subtag', (l: string) => `${l}--SE`],
      ['a subtag over eight letters', (l: string) => `${l}-abcdefghi`],
      ['a space inside a range', (l: string) => `${l} SE`],
      ['quotes', (l: string) => `"${l}"`],
      ['markup', (l: string) => `<${l}>`],
      [
        'its name for a code',
        (l: string) => new Intl.DisplayNames([l], { type: 'language' }).of(l)!,
      ],
    ])('reads no language from %s', (_label, header) => {
      expect(read(header(other))).toBeNull();
    });

    it('keeps the first of thousands of equal entries', () => {
      expect(read(`${'zz,'.repeat(5000)}${other}`)).toBeNull();
    });
  },
);
