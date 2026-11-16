import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { serviceError } from './errors';
import { waitInMinutes } from './format-duration';
import { refusalFromQuery, refusalText } from './organizer-errors';
import { TITLE_TOO_SHORT_MESSAGE } from './signup-limits';
import { ERROR_CODES } from './testing/error-codes';

const t = getTestTranslator('organizer.errors');
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

describe('the organizer catalog’s refusals', () => {
  it('say a title is too short as the Build tab and the API do', () => {
    expect(
      refusalText(
        t,
        serviceError('invalid_input', 'x', { details: { reason: 'title_too_short' } }),
      ),
    ).toBe(TITLE_TOO_SHORT_MESSAGE);
  });

  it('give the wait for the create limit in whole minutes, as before', () => {
    for (const seconds of [1, 60, 61, 3599, 3600 * 30]) {
      expect(t('tooManySignups', { minutes: Math.max(1, Math.ceil(seconds / 60)) })).toBe(
        `You’ve created a lot of signups in the last hour. Try again in about ${waitInMinutes(seconds)}.`,
      );
    }
  });
});

describe('refusalText', () => {
  it('words a refusal by its code, never by its message', () => {
    for (const code of ERROR_CODES) {
      const text = refusalText(t, serviceError(code, 'your role cannot modify this workspace'));
      expect(text).toBe(t(`code.${code}`));
    }
  });

  it('gives a reason it has no words for the line for the code', () => {
    const error = serviceError('invalid_input', 'Invalid email', {
      details: { reason: 'email_invalid' },
    });
    expect(refusalText(t, error)).toBe('Some values weren’t accepted.');
  });

  it.each(OTHER_LANGUAGES)('asks the catalog in the language it is given, %s', (other) => {
    const inOther = getStandInTranslator(other, 'organizer.errors');
    expect(refusalText(inOther, serviceError('forbidden', 'x'))).toBe(
      `organizer.errors.code.forbidden in ${other}`,
    );
    const tooShort = serviceError('invalid_input', 'x', { details: { reason: 'title_too_short' } });
    expect(refusalText(inOther, tooShort)).toBe(`organizer.errors.titleTooShort in ${other}`);
  });
});

describe('refusalFromQuery', () => {
  it('words each code a server action sends', () => {
    for (const code of ERROR_CODES) expect(refusalFromQuery(t, code)).toBe(t(`code.${code}`));
  });

  it('shows nothing for anything else, so a link can’t put words on the page', () => {
    for (const error of [
      undefined,
      '',
      'Your account is locked. Email us at once.',
      'toString',
      'hasOwnProperty',
      'FORBIDDEN',
    ]) {
      expect(refusalFromQuery(t, error)).toBeNull();
    }
  });
});
