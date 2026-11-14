import compile from 'icu-minify/compile';
import type { useTranslations } from 'next-intl';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { _createCache, _createIntlFormatters, IntlErrorCode } from 'use-intl/core';
// The formatter next-intl's plugin puts in place of use-intl's full one in
// the Next build when messages are precompiled.
import formatPrecompiled from 'use-intl/format-message/format-only';
import en from '@/messages/en.json';
import { getTestTranslator } from './testing/translator';
import { getTranslator, messagesFor, namespaceMessages, withEnglishUnder } from './translator';

describe('getTranslator', () => {
  it('translates from the English catalog', () => {
    const t = getTranslator('en', 'common.footer', { onError: vi.fn() });
    expect(t('help')).toBe('Help');
  });

  it('reads a namespace inside a top-level one the same as from the top', () => {
    const t = getTranslator('en', 'common', { onError: vi.fn() });
    expect(t('footer.help')).toBe(getTestTranslator('common.footer')('help'));
  });

  it('returns the type useTranslations returns, so helpers work on either', () => {
    expectTypeOf(getTestTranslator('common.footer')).toEqualTypeOf<
      ReturnType<typeof useTranslations<'common.footer'>>
    >();
  });

  it('reports a key missing from English and shows its path', () => {
    const onError = vi.fn();
    const t = getTranslator('en', 'common.footer', { onError });
    // @ts-expect-error not a key in en.json
    expect(t('nowhere')).toBe('common.footer.nowhere');
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ code: IntlErrorCode.MISSING_MESSAGE });
  });

  it('types each message’s arguments from its English text', () => {
    const t = getTestTranslator('common.footer');
    // @ts-expect-error "Help" has no {name} to fill
    expect(t('help', { name: 'Pat' })).toBe('Help');
  });
});

describe('getTestTranslator', () => {
  it('throws on a missing key, so the test that used it fails', () => {
    const t = getTestTranslator('common.footer');
    // @ts-expect-error not a key in en.json
    expect(() => t('nowhere')).toThrow(/nowhere/);
  });
});

describe('messagesFor', () => {
  it('gives only the namespace asked for, under its path', () => {
    expect(messagesFor('en', 'participant.fields')).toEqual({
      participant: { fields: en.participant.fields },
    });
    expect(messagesFor('en', 'common.footer')).toEqual({ common: { footer: en.common.footer } });
  });

  it('gives a whole top-level namespace when that’s what is asked for', () => {
    expect(messagesFor('en', 'common')).toEqual({ common: en.common });
  });

  it('builds each language’s namespace once', () => {
    expect(messagesFor('en', 'participant.fields')).toBe(messagesFor('en', 'participant.fields'));
  });
});

describe('namespaceMessages', () => {
  const english = {
    page: { title: 'Sign up' },
    dialog: { confirm: 'Confirm', cancel: 'Cancel', fields: { name: 'Your name' } },
  };

  it('takes the namespace from the language, with English under it, and nothing else', () => {
    const own = { page: { title: 'Anmäl dig' }, dialog: { confirm: 'Bekräfta' } };
    expect(namespaceMessages('dialog', english, own)).toEqual({
      dialog: { confirm: 'Bekräfta', cancel: 'Cancel', fields: { name: 'Your name' } },
    });
  });

  it('goes as deep as the namespace does', () => {
    const own = { dialog: { confirm: 'Bekräfta', fields: { name: 'Ditt namn' } } };
    expect(namespaceMessages('dialog.fields', english, own)).toEqual({
      dialog: { fields: { name: 'Ditt namn' } },
    });
  });

  it('gives English where the language lacks the namespace, or has a message there', () => {
    const englishOnly = { dialog: { fields: { name: 'Your name' } } };
    expect(namespaceMessages('dialog.fields', english, {})).toEqual(englishOnly);
    expect(namespaceMessages('dialog.fields', english, { dialog: 'Dialog' })).toEqual(englishOnly);
    expect(namespaceMessages('dialog.fields', english, { dialog: { fields: 'Fält' } })).toEqual(
      englishOnly,
    );
  });

  it('gives an empty section for a namespace English hasn’t got', () => {
    expect(namespaceMessages('dialog.nowhere', english, english)).toEqual({
      dialog: { nowhere: {} },
    });
  });
});

describe('withEnglishUnder', () => {
  const english = {
    title: 'Sign up',
    dialog: { confirm: 'Confirm', cancel: 'Cancel' },
  };

  it('keeps the language’s own messages', () => {
    const own = { title: 'Anmäl dig', dialog: { confirm: 'Bekräfta', cancel: 'Avbryt' } };
    expect(withEnglishUnder(english, own)).toEqual(own);
  });

  it('fills each gap with English, however deep', () => {
    expect(withEnglishUnder(english, { dialog: { confirm: 'Bekräfta' } })).toEqual({
      title: 'Sign up',
      dialog: { confirm: 'Bekräfta', cancel: 'Cancel' },
    });
    expect(withEnglishUnder(english, undefined)).toEqual(english);
  });

  it('keeps English where the language has the wrong kind of value', () => {
    expect(withEnglishUnder(english, { title: { oops: 'x' }, dialog: 'Dialog' })).toEqual(english);
  });

  it('drops keys English doesn’t have', () => {
    expect(withEnglishUnder(english, { stale: 'Gammal' })).toEqual(english);
  });
});

/**
 * In the Next build, next-intl's loader compiles every catalog the app imports
 * (`precompile` in next.config.mjs), the server's included: plain text stays a
 * string, and a message with an argument, a plural or a tag becomes an array.
 * The merge has to keep those arrays whole, or every such message renders as
 * its key path in the web process while vitest and the worker, which read the
 * raw JSON, stay green.
 */
describe('withEnglishUnder on precompiled catalogs', () => {
  type Raw = { [key: string]: string | Raw };
  const precompiled = (catalog: Raw): Parameters<typeof withEnglishUnder>[0] =>
    Object.fromEntries(
      Object.entries(catalog).map(([key, value]) => [
        key,
        typeof value === 'string' ? compile(value) : precompiled(value),
      ]),
    );

  const english = precompiled({
    title: 'Sign up',
    greeting: 'Hello {name}',
    spots: '{count, plural, one {# spot} other {# spots}}',
    dialog: { guide: 'Read <link>the guide</link>', cancel: 'Cancel' },
  });
  const swedish = precompiled({
    greeting: 'Hej {name}',
    spots: '{count, plural, one {# plats} other {# platser}}',
    dialog: { guide: 'Läs <link>guiden</link>' },
  });

  it('compiles these fixtures to arrays, as the build does', () => {
    expect(english.greeting).toEqual(['Hello ', ['name']]);
    expect(english.title).toBe('Sign up');
  });

  it('keeps each compiled message whole', () => {
    expect(withEnglishUnder(english, undefined)).toEqual(english);
    expect(withEnglishUnder(english, english)).toEqual(english);
  });

  it('keeps the language’s compiled messages and fills gaps with compiled English', () => {
    expect(withEnglishUnder(english, swedish)).toEqual({
      title: 'Sign up',
      greeting: swedish.greeting,
      spots: swedish.spots,
      dialog: { guide: (swedish.dialog as Record<string, unknown>).guide, cancel: 'Cancel' },
    });
  });

  it('takes a translation’s compiled message where English is plain text, and the reverse', () => {
    const own = precompiled({ title: 'Anmäl {name}', greeting: 'Hej' });
    expect(withEnglishUnder(english, own)).toMatchObject({
      title: own.title,
      greeting: 'Hej',
    });
  });

  it('keeps English where the language has a section for a compiled message', () => {
    expect(withEnglishUnder(english, { greeting: { oops: 'x' } })).toEqual(english);
  });

  it('keeps English where the language has something that is neither', () => {
    // The catalog check refuses these, but the raw JSON could still hold them.
    const own = { title: null, greeting: 5, dialog: null } as never;
    expect(withEnglishUnder(english, own)).toEqual(english);
  });

  it('narrows to a namespace with each compiled message in it kept whole', () => {
    expect(namespaceMessages('dialog', english, swedish)).toEqual({
      dialog: { guide: (swedish.dialog as Record<string, unknown>).guide, cancel: 'Cancel' },
    });
  });

  it('never takes a compiled message for a section on the way to a namespace', () => {
    // An array is an object, so a walk that went by `typeof` would go into
    // one, and find a plural's branches (`{ one: …, other: … }`) at `0.2`.
    expect(english.spots).toEqual([
      ['count', 2, expect.objectContaining({ one: expect.anything() })],
    ]);
    expect(namespaceMessages('spots.0.2', english, swedish)).toEqual({ spots: { 0: { 2: {} } } });
    expect(namespaceMessages('greeting', english, swedish)).toEqual({ greeting: {} });
  });

  it('formats each merged message with the formatter the build uses', () => {
    const merged = withEnglishUnder(english, swedish);
    const cache = _createCache();
    const format = (key: string, message: unknown, values: Record<string, unknown>) =>
      formatPrecompiled(key, message as never, values as never, {
        cache,
        formatters: _createIntlFormatters(cache),
        locale: 'sv',
        timeZone: 'UTC',
      });
    expect(format('greeting', merged.greeting, { name: 'Pat' })).toBe('Hej Pat');
    expect(format('spots', merged.spots, { count: 2 })).toBe('2 platser');
    expect(
      format('guide', (merged.dialog as Record<string, unknown>).guide, {
        link: (chunks: string[]) => `<a>${chunks.join('')}</a>`,
      }),
    ).toBe('Läs <a>guiden</a>');
  });
});
