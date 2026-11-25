import { describe, expect, expectTypeOf, it } from 'vitest';
import { connectedAppsLines } from '@/app/(organizer)/app/(chrome)/settings/connected-apps/refusal-lines';
import { CATALOG_LOCALES } from '@/i18n/config';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { serviceError, type ErrorCode, type ErrorReason } from './errors';
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
        `You've created a lot of signups in the last hour. Try again in about ${waitInMinutes(seconds)}.`,
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
    expect(refusalText(t, error)).toBe("Some values weren't accepted.");
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

describe('refusalText with a screen’s own lines', () => {
  const tooShort = serviceError('invalid_input', 'x', { details: { reason: 'title_too_short' } });
  const plain = serviceError('invalid_input', 'x');

  it('goes own reason, shared reason, own code, own other, then the code’s line', () => {
    const forCode = { invalid_input: 'Own code', other: 'Own other' };
    expect(refusalText(t, tooShort, { title_too_short: 'Own reason', ...forCode })).toBe(
      'Own reason',
    );
    expect(refusalText(t, tooShort, forCode)).toBe(TITLE_TOO_SHORT_MESSAGE);
    expect(refusalText(t, plain, forCode)).toBe('Own code');
    expect(refusalText(t, plain, { other: 'Own other' })).toBe('Own other');
    expect(refusalText(t, plain, {})).toBe("Some values weren't accepted.");
  });

  it('gives a viewer the same line on every screen, whatever lines the screen has', () => {
    const viewer = serviceError('forbidden', 'your role cannot modify this workspace');
    expect(refusalText(t, viewer, { other: 'Own other' })).toBe("You don't have edit access.");
    // @ts-expect-error A screen has no line of its own for a viewer.
    expect(refusalText(t, viewer, { forbidden: 'Own line' })).toBe("You don't have edit access.");
  });

  it('ignores a reason that isn’t one of the screen’s own keys', () => {
    for (const reason of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      const error = { code: 'conflict' as const, details: { reason: reason as ErrorReason } };
      expect(refusalText(t, error, { other: 'Own other' })).toBe('Own other');
    }
  });

  it('can’t mistake a reason for a code or for `other`', () => {
    expectTypeOf<Extract<ErrorReason, ErrorCode | 'other'>>().toBeNever();
  });
});

describe('refusalFromQuery', () => {
  it('words each code a server action sends', () => {
    for (const code of ERROR_CODES) expect(refusalFromQuery(t, code)).toBe(t(`code.${code}`));
  });

  it('gives a screen’s own line for a code, as Connected apps does for a failed disconnect', () => {
    const own = connectedAppsLines(t);
    expect(refusalFromQuery(t, 'internal', own)).toBe("Couldn't disconnect. Try again.");
    // An app already disconnected, in another tab: the server's message was
    // "no such connected app".
    expect(refusalFromQuery(t, 'not_found', own)).toBe('That app is already disconnected.');
    expect(refusalFromQuery(t, 'forbidden', own)).toBe("You don't have edit access.");
    expect(refusalFromQuery(t, 'rate_limited', own)).toBe(t('code.rate_limited'));
  });

  it('shows nothing for anything else, so a link can’t put words on the page', () => {
    for (const error of [
      undefined,
      '',
      'Your account is locked. Email us at once.',
      'no such connected app',
      'toString',
      'hasOwnProperty',
      'FORBIDDEN',
      'other',
    ]) {
      expect(refusalFromQuery(t, error)).toBeNull();
      expect(refusalFromQuery(t, error, { internal: 'Own code', other: 'Own other' })).toBeNull();
    }
  });
});
