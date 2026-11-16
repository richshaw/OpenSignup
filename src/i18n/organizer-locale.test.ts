import { describe, expect, expectTypeOf, it } from 'vitest';
import { CATALOG_LOCALES, type CatalogLocale } from './config';
import { chooseOrganizerLocale, newOrganizerLocale } from './organizer-locale';
import { accountLanguageTable } from './testing/account-language-table';
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

/** A new account's language with no `DEFAULT_LOCALE` set. */
const noDefault = (acceptLanguage: string | null) =>
  newOrganizerLocale({ acceptLanguage, instanceDefault: undefined });

describe('the decision table in docs/translating.md (“An organizer’s language”)', () => {
  const rows = accountLanguageTable();

  it('has a row for each site default and each kind of browser', () => {
    expect(rows).toHaveLength(12);
    expect(new Set(rows.map((row) => row.label)).size).toBe(12);
  });

  it.each(rows)('$label: stores what the row says, and the account gets its language', (row) => {
    ship('participant', ['en', 'sv']);
    for (const acceptLanguage of row.headers) {
      const stored = newOrganizerLocale({ acceptLanguage, instanceDefault: row.instanceDefault });
      expect(stored, String(acceptLanguage)).toBe(row.stored);
      const gets = chooseOrganizerLocale({
        audience: 'participant',
        saved: stored,
        instanceDefault: row.instanceDefault,
      });
      expect(gets.locale, String(acceptLanguage)).toBe(row.gets);
    }
  });
});

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
    expect(noDefault(header)).toBeNull();
    expect(newOrganizerLocale({ acceptLanguage: header, instanceDefault: 'en' })).toBeNull();
  });

  it.each(OTHER_LANGUAGES)('stores nothing while %s has shipped only to organizers', (other) => {
    ship('organizer', ['en', other]);
    expect(noDefault(other)).toBeNull();
  });
});

describe.each(OTHER_LANGUAGES)(
  'newOrganizerLocale once %s has shipped to participants',
  (other) => {
    const read = (header: string | null) => {
      ship('participant', ['en', other]);
      return noDefault(header);
    };

    it('stores the browser’s top language when it has shipped and isn’t English', () => {
      expect(read(other)).toBe(other);
      expect(read(`${other},en;q=0.8`)).toBe(other);
    });

    it('stores nothing for an English browser, which gets English anyway', () => {
      expect(read('en')).toBeNull();
      expect(read(`en,${other};q=0.8`)).toBeNull();
      expect(read('en-US')).toBeNull();
    });

    it.each<CatalogLocale>(['en', other])(
      'stores nothing when the site sets a default (%s), whatever the browser asks for',
      (instanceDefault) => {
        ship('participant', ['en', other]);
        for (const acceptLanguage of [other, `${other}-ZZ,en;q=0.5`, 'en', null]) {
          expect(newOrganizerLocale({ acceptLanguage, instanceDefault })).toBeNull();
        }
      },
    );

    it('lets a stored language that later leaves the list count as nothing stored', () => {
      const stored = read(other);
      expect(stored).toBe(other);
      // The language is withdrawn: the account gets the site's default, if it
      // has shipped, else English, as an account with nothing stored does.
      ship('participant', ['en']);
      for (const instanceDefault of [undefined, 'en', other] as const) {
        expect(
          chooseOrganizerLocale({ audience: 'participant', saved: stored, instanceDefault }),
        ).toEqual(chooseOrganizerLocale({ audience: 'participant', saved: null, instanceDefault }));
      }
      expect(
        chooseOrganizerLocale({ audience: 'participant', saved: stored, instanceDefault: other })
          .locale,
      ).toBe('en');
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
