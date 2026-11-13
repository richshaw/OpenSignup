import type { useTranslations } from 'next-intl';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { IntlErrorCode } from 'use-intl/core';
import { getTestTranslator } from './testing/translator';
import { getTranslator, withEnglishUnder } from './translator';

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
