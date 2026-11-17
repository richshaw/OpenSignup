import { describe, expect, it } from 'vitest';
import { SHIPPED } from '@/i18n/config';
import { checkSignupLocale, unshippedSignupLocale } from './signups';

const offered = SHIPPED.participant.join(', ');

describe('unshippedSignupLocale', () => {
  it('refuses on `locale` and lists the shipped languages', () => {
    expect(unshippedSignupLocale('xx')).toMatchObject({
      code: 'invalid_input',
      message: 'locale must be a language OpenSignup offers for signups',
      field: 'locale',
      received: 'xx',
      suggestion: `use one of: ${offered}`,
    });
  });

  it('says the language can be left out where it is optional', () => {
    expect(
      unshippedSignupLocale('xx', { field: 'settings.locale', canLeaveOut: true }),
    ).toMatchObject({
      field: 'settings.locale',
      suggestion: `leave it out, or use one of: ${offered}`,
    });
  });
});

describe('checkSignupLocale', () => {
  it('lets a missing language through and refuses an unshipped one', () => {
    expect(checkSignupLocale(undefined)).toEqual({ ok: true, value: undefined });
    const refused = checkSignupLocale('xx');
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error).toMatchObject({
        field: 'settings.locale',
        received: 'xx',
        suggestion: `leave it out, or use one of: ${offered}`,
      });
    }
  });
});
