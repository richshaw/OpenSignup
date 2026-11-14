import { describe, expect, it } from 'vitest';
import { languageName } from './config';
import { chooseOrganizerLocale } from './organizer-locale';
import { OTHER_LANGUAGE, OTHER_LOCALE, withRegion } from './testing/locales';
import { ship } from './testing/ship';

type Input = Parameters<typeof chooseOrganizerLocale>[0];
const NOTHING: Input = {
  audience: 'participant',
  saved: null,
  instanceDefault: undefined,
  acceptLanguage: null,
};
const choose = (input: Partial<Input>) => chooseOrganizerLocale({ ...NOTHING, ...input });

describe('chooseOrganizerLocale while only English has shipped', () => {
  it('is English, from whichever step names it first', () => {
    expect(choose({ saved: 'en', instanceDefault: 'en', acceptLanguage: 'en' })).toEqual({
      locale: 'en',
      source: 'setting',
    });
    expect(choose({ instanceDefault: 'en', acceptLanguage: 'en' })).toEqual({
      locale: 'en',
      source: 'instance',
    });
    expect(choose({ acceptLanguage: 'en-GB' })).toEqual({ locale: 'en', source: 'browser' });
    expect(choose({})).toEqual({ locale: 'en', source: 'default' });
  });

  it(`gives a ${OTHER_LANGUAGE} browser English, without reading past its first language`, () => {
    expect(choose({ acceptLanguage: `${OTHER_LOCALE},en;q=0.8` })).toEqual({
      locale: 'en',
      source: 'default',
    });
  });
});

describe(`chooseOrganizerLocale once ${OTHER_LANGUAGE} has shipped to participants`, () => {
  it('takes the saved language before anything else', () => {
    ship('participant', ['en', OTHER_LOCALE]);
    expect(choose({ saved: OTHER_LOCALE, instanceDefault: 'en', acceptLanguage: 'en' })).toEqual({
      locale: OTHER_LOCALE,
      source: 'setting',
    });
    expect(
      choose({ saved: 'en', instanceDefault: OTHER_LOCALE, acceptLanguage: OTHER_LOCALE }),
    ).toEqual({
      locale: 'en',
      source: 'setting',
    });
  });

  it('takes the instance default next, when it is set', () => {
    ship('participant', ['en', OTHER_LOCALE]);
    expect(choose({ instanceDefault: OTHER_LOCALE, acceptLanguage: 'en-US' })).toEqual({
      locale: OTHER_LOCALE,
      source: 'instance',
    });
  });

  it('follows the browser when the instance sets no default', () => {
    ship('participant', ['en', OTHER_LOCALE]);
    expect(choose({ acceptLanguage: `${OTHER_LOCALE},en;q=0.8` })).toEqual({
      locale: OTHER_LOCALE,
      source: 'browser',
    });
    expect(choose({ acceptLanguage: `en,${OTHER_LOCALE};q=0.8` })).toEqual({
      locale: 'en',
      source: 'browser',
    });
  });

  it('is English for an assistant, which has no browser of the organizer’s', () => {
    ship('participant', ['en', OTHER_LOCALE]);
    expect(choose({ acceptLanguage: null })).toEqual({ locale: 'en', source: 'default' });
  });

  it('passes over a saved language that has left the list', () => {
    // Saved while it had shipped, read after it was withdrawn.
    expect(choose({ saved: OTHER_LOCALE, acceptLanguage: 'en-US' })).toEqual({
      locale: 'en',
      source: 'browser',
    });
    expect(choose({ saved: OTHER_LOCALE, acceptLanguage: withRegion(OTHER_LOCALE) })).toEqual({
      locale: 'en',
      source: 'default',
    });
    // And one that never had a catalog.
    ship('participant', ['en', OTHER_LOCALE]);
    expect(choose({ saved: 'xx', acceptLanguage: OTHER_LOCALE })).toEqual({
      locale: OTHER_LOCALE,
      source: 'browser',
    });
  });

  it('checks every step against the list for the audience asked about', () => {
    ship('participant', ['en', OTHER_LOCALE]);
    const input = {
      saved: OTHER_LOCALE,
      instanceDefault: OTHER_LOCALE,
      acceptLanguage: OTHER_LOCALE,
    };
    expect(choose({ ...input, audience: 'organizer' })).toEqual({
      locale: 'en',
      source: 'default',
    });
    expect(choose({ ...input, audience: 'participant' })).toEqual({
      locale: OTHER_LOCALE,
      source: 'setting',
    });
  });

  it('passes over an instance default that has not shipped to the audience', () => {
    ship('organizer', ['en', OTHER_LOCALE]);
    expect(choose({ instanceDefault: OTHER_LOCALE, acceptLanguage: 'en-US' })).toEqual({
      locale: 'en',
      source: 'browser',
    });
  });
});

describe('chooseOrganizerLocale reading Accept-Language', () => {
  const browser = (acceptLanguage: string) => {
    ship('participant', ['en', OTHER_LOCALE]);
    return choose({ acceptLanguage });
  };

  it.each([
    ['a region', withRegion(OTHER_LOCALE)],
    ['a region in other cases', `${OTHER_LOCALE.toUpperCase()}-se`],
    ['a script and a region', `${OTHER_LOCALE}-Latn-SE`],
    ['a higher weight listed later', `en;q=0.5, ${OTHER_LOCALE}`],
    ['two weights', `en;q=0.5,${OTHER_LOCALE};q=0.9`],
    ['a tie, by the first listed', `${OTHER_LOCALE};q=0.8, en;q=0.8`],
    ['a weight of 1 written out', `${OTHER_LOCALE};q=1.000, en`],
    ['an upper-case Q', `en;Q=0.5, ${OTHER_LOCALE};Q=0.6`],
    ['spaces around each part', ` ${withRegion(OTHER_LOCALE)} ; q=0.9 , en ; q=0.8 `],
    ['a language refused with q=0 ahead of it', `en;q=0, ${OTHER_LOCALE};q=0.5`],
    ['the wildcard ranked below it', `${OTHER_LOCALE}, *;q=0.5`],
    ['an unreadable entry ahead of it', `en;q=2, ${OTHER_LOCALE};q=0.5`],
  ])(`takes ${OTHER_LANGUAGE} from %s`, (_label, header) => {
    expect(browser(header)).toEqual({ locale: OTHER_LOCALE, source: 'browser' });
  });

  it.each([
    [`a language that has not shipped, ahead of ${OTHER_LANGUAGE}`, `de, ${OTHER_LOCALE};q=0.9`],
    ['a regional one that has not shipped', `de-DE, ${withRegion(OTHER_LOCALE)};q=0.9`],
    ['the wildcard ranked first', `*, ${OTHER_LOCALE};q=0.5`],
    ['the wildcard alone', '*'],
    ['only a refusal', `${OTHER_LOCALE};q=0`],
  ])('is English for %s', (_label, header) => {
    expect(browser(header)).toEqual({ locale: 'en', source: 'default' });
  });

  it.each([
    ['nothing', ''],
    ['spaces', '   '],
    ['empty entries', ',,;,'],
    ['a weight with no range', ';q=1'],
    ['an underscore for the hyphen', `${OTHER_LOCALE}_SE`],
    ['digits for a language', '12'],
    ['a blank weight', `${OTHER_LOCALE};q=`],
    ['a word for a weight', `${OTHER_LOCALE};q=abc`],
    ['a weight over 1', `${OTHER_LOCALE};q=1.5`],
    ['a negative weight', `${OTHER_LOCALE};q=-1`],
    ['four decimals', `${OTHER_LOCALE};q=0.5555`],
    ['two weights on one range', `${OTHER_LOCALE};q=0.5;q=0.6`],
    ['another parameter', `${OTHER_LOCALE};level=1`],
    ['a trailing semicolon', `${OTHER_LOCALE};`],
    ['a trailing hyphen', `${OTHER_LOCALE}-`],
    ['a leading hyphen', `-${OTHER_LOCALE}`],
    ['an empty subtag', `${OTHER_LOCALE}--SE`],
    ['a subtag over eight letters', `${OTHER_LOCALE}-abcdefghi`],
    ['a space inside a range', `${OTHER_LOCALE} SE`],
    ['quotes', `"${OTHER_LOCALE}"`],
    ['markup', `<${OTHER_LOCALE}>`],
    ['a name for a code', languageName(OTHER_LOCALE).toLowerCase()],
  ])('reads no language from %s', (_label, header) => {
    expect(browser(header)).toEqual({ locale: 'en', source: 'default' });
  });

  it('keeps the first of thousands of equal entries', () => {
    expect(browser(`${'xx,'.repeat(5000)}${OTHER_LOCALE}`)).toEqual({
      locale: 'en',
      source: 'default',
    });
  });
});
