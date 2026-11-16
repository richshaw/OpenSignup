import { describe, expect, it } from 'vitest';
import type { CatalogLocale } from './config';
import { chooseOrganizerLocale } from './organizer-locale';
import { ship } from './testing/ship';

const SV: CatalogLocale = 'sv';

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

  it('gives a Swedish browser English, without reading past its first language', () => {
    expect(choose({ acceptLanguage: 'sv,en;q=0.8' })).toEqual({ locale: 'en', source: 'default' });
  });
});

describe('chooseOrganizerLocale once Swedish has shipped to participants', () => {
  it('takes the saved language before anything else', () => {
    ship('participant', ['en', 'sv']);
    expect(choose({ saved: 'sv', instanceDefault: 'en', acceptLanguage: 'en' })).toEqual({
      locale: 'sv',
      source: 'setting',
    });
    expect(choose({ saved: 'en', instanceDefault: SV, acceptLanguage: 'sv' })).toEqual({
      locale: 'en',
      source: 'setting',
    });
  });

  it('takes the instance default next, when it is set', () => {
    ship('participant', ['en', 'sv']);
    expect(choose({ instanceDefault: SV, acceptLanguage: 'en-US' })).toEqual({
      locale: 'sv',
      source: 'instance',
    });
  });

  it('follows the browser when the instance sets no default', () => {
    ship('participant', ['en', 'sv']);
    expect(choose({ acceptLanguage: 'sv,en;q=0.8' })).toEqual({ locale: 'sv', source: 'browser' });
    expect(choose({ acceptLanguage: 'en,sv;q=0.8' })).toEqual({ locale: 'en', source: 'browser' });
  });

  it('is English for an assistant, which has no browser of the organizer’s', () => {
    ship('participant', ['en', 'sv']);
    expect(choose({ acceptLanguage: null })).toEqual({ locale: 'en', source: 'default' });
  });

  it('passes over a saved language that has left the list', () => {
    // Saved while Swedish had shipped, read after it was withdrawn.
    expect(choose({ saved: 'sv', acceptLanguage: 'en-US' })).toEqual({
      locale: 'en',
      source: 'browser',
    });
    expect(choose({ saved: 'sv', acceptLanguage: 'sv-SE' })).toEqual({
      locale: 'en',
      source: 'default',
    });
    // And one that never had a catalog.
    ship('participant', ['en', 'sv']);
    expect(choose({ saved: 'xx', acceptLanguage: 'sv' })).toEqual({
      locale: 'sv',
      source: 'browser',
    });
  });

  it('checks every step against the list for the audience asked about', () => {
    ship('participant', ['en', 'sv']);
    const input = { saved: 'sv', instanceDefault: SV, acceptLanguage: 'sv' };
    expect(choose({ ...input, audience: 'organizer' })).toEqual({
      locale: 'en',
      source: 'default',
    });
    expect(choose({ ...input, audience: 'participant' })).toEqual({
      locale: 'sv',
      source: 'setting',
    });
  });

  it('passes over an instance default that has not shipped to the audience', () => {
    ship('organizer', ['en', 'sv']);
    expect(choose({ instanceDefault: SV, acceptLanguage: 'en-US' })).toEqual({
      locale: 'en',
      source: 'browser',
    });
  });
});

describe('chooseOrganizerLocale reading Accept-Language', () => {
  const browser = (acceptLanguage: string) => {
    ship('participant', ['en', 'sv']);
    return choose({ acceptLanguage });
  };

  it.each([
    ['a region', 'sv-SE'],
    ['a region in other cases', 'SV-se'],
    ['a script and a region', 'sv-Latn-SE'],
    ['a higher weight listed later', 'en;q=0.5, sv'],
    ['two weights', 'en;q=0.5,sv;q=0.9'],
    ['a tie, by the first listed', 'sv;q=0.8, en;q=0.8'],
    ['a weight of 1 written out', 'sv;q=1.000, en'],
    ['an upper-case Q', 'en;Q=0.5, sv;Q=0.6'],
    ['spaces around each part', ' sv-SE ; q=0.9 , en ; q=0.8 '],
    ['a language refused with q=0 ahead of it', 'en;q=0, sv;q=0.5'],
    ['the wildcard ranked below it', 'sv, *;q=0.5'],
    ['an unreadable entry ahead of it', 'en;q=2, sv;q=0.5'],
  ])('takes Swedish from %s', (_label, header) => {
    expect(browser(header)).toEqual({ locale: 'sv', source: 'browser' });
  });

  it.each([
    ['a language that has not shipped, ahead of Swedish', 'de, sv;q=0.9'],
    ['a regional one that has not shipped', 'de-DE, sv-SE;q=0.9'],
    ['the wildcard ranked first', '*, sv;q=0.5'],
    ['the wildcard alone', '*'],
    ['only a refusal', 'sv;q=0'],
  ])('is English for %s', (_label, header) => {
    expect(browser(header)).toEqual({ locale: 'en', source: 'default' });
  });

  it.each([
    ['nothing', ''],
    ['spaces', '   '],
    ['empty entries', ',,;,'],
    ['a weight with no range', ';q=1'],
    ['an underscore for the hyphen', 'sv_SE'],
    ['digits for a language', '12'],
    ['a blank weight', 'sv;q='],
    ['a word for a weight', 'sv;q=abc'],
    ['a weight over 1', 'sv;q=1.5'],
    ['a negative weight', 'sv;q=-1'],
    ['four decimals', 'sv;q=0.5555'],
    ['two weights on one range', 'sv;q=0.5;q=0.6'],
    ['another parameter', 'sv;level=1'],
    ['a trailing semicolon', 'sv;'],
    ['a trailing hyphen', 'sv-'],
    ['a leading hyphen', '-sv'],
    ['an empty subtag', 'sv--SE'],
    ['a subtag over eight letters', 'sv-abcdefghi'],
    ['a space inside a range', 'sv SE'],
    ['quotes', '"sv"'],
    ['markup', '<sv>'],
    ['a name for a code', 'svenska'],
  ])('reads no language from %s', (_label, header) => {
    expect(browser(header)).toEqual({ locale: 'en', source: 'default' });
  });

  it('keeps the first of thousands of equal entries', () => {
    expect(browser(`${'xx,'.repeat(5000)}sv`)).toEqual({ locale: 'en', source: 'default' });
  });
});
