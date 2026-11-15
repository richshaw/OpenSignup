import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { disconnectRefusal } from './disconnect-refusal';

const t = getTestTranslator('organizer.errors');

describe('disconnectRefusal', () => {
  it('says a failed disconnect as before', () => {
    expect(disconnectRefusal(t, 'internal')).toBe('Could not disconnect. Try again.');
  });

  it('words any other refusal by its code, never with the server’s English', () => {
    // An app already disconnected, in another tab: the server's message was
    // "no such connected app".
    expect(disconnectRefusal(t, 'not_found')).toBe('No longer available.');
    expect(disconnectRefusal(t, 'forbidden')).toBe('You don’t have edit access.');
  });

  it('shows nothing for anything else, so a link can’t put words on the page', () => {
    for (const error of [undefined, '', 'no such connected app', 'toString']) {
      expect(disconnectRefusal(t, error)).toBeNull();
    }
  });

  it.each(CATALOG_LOCALES.filter((locale) => locale !== 'en'))(
    'asks the catalog in the language it is given, %s',
    (other) => {
      const inOther = getStandInTranslator(other, 'organizer.errors');
      expect(disconnectRefusal(inOther, 'internal')).toBe(
        `organizer.errors.disconnectFailed in ${other}`,
      );
      expect(disconnectRefusal(inOther, 'not_found')).toBe(
        `organizer.errors.code.not_found in ${other}`,
      );
    },
  );
});
