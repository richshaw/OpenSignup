import { describe, expect, it } from 'vitest';
import { createTranslator } from 'use-intl/core';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import type { Translator } from '@/i18n/translator';
import en from '@/messages/en.json';
import { loginFormText } from './login-text';

describe('loginFormText', () => {
  it('is the form’s English, word for word as it read before the catalog', () => {
    expect(loginFormText(getTestTranslator('auth'))).toEqual({
      email: 'Email',
      emailPlaceholder: 'you@example.com',
      send: 'Send magic link',
      sending: 'Sending…',
      sent: 'Sent — check your email',
      sentTo: { before: 'Link sent to ', after: '. Check your inbox.' },
      sendAgain: 'Send again',
      tryAgain: 'Try again',
      errors: {
        invalid_email: "That doesn't look like a valid email address.",
        send_failed: "Couldn't send. Please try again.",
        rate_limited:
          'Too many sign-in requests. Wait up to an hour. If we already emailed you a link, you can use that.',
      },
      code: {
        label: 'Opened the email on another device?',
        hint: 'Type the six-digit code from the email to sign in here instead.',
        submit: 'Sign in with code',
        checking: 'Checking…',
        errors: {
          no_email: 'Request a new link first.',
          rate_limited: 'Too many tries. Wait a few minutes, or click the link in the email.',
          expired: 'That code has expired. Request a new link.',
          wrong: 'That code is not right. Check the email and try again.',
          failed: 'Something went wrong. Try again.',
        },
      },
    });
  });

  it.each(TEST_LOCALES)('asks the catalog in %s for every word', (locale) => {
    const text = loginFormText(getStandInTranslator(locale, 'auth'));
    const words = (value: unknown): string[] =>
      typeof value === 'string' ? [value] : Object.values(value as object).flatMap(words);
    // The line after a sent link is cut where the address goes, and the
    // stand-in has no address in it, so all of it comes before.
    const { sentTo, ...rest } = text;
    expect(sentTo).toEqual({ before: `auth.form.sentTo in ${locale}`, after: '' });
    for (const word of words(rest)) {
      expect(word).toMatch(new RegExp(`^auth\\.(form|code)\\.[\\w.]+ in ${locale}$`));
    }
    expect(text.errors.rate_limited).toBe(`auth.form.errors.rateLimited in ${locale}`);
    expect(text.code.errors.no_email).toBe(`auth.code.errors.noEmail in ${locale}`);
  });

  // A translation may put the address anywhere in its sentence.
  it.each([
    ['at the start', '{email}: the link is on its way.', '', ': the link is on its way.'],
    ['in the middle', 'We sent {email} a link.', 'We sent ', ' a link.'],
    ['at the end', 'A link went to {email}', 'A link went to ', ''],
  ])('cuts the sent line where the address goes, %s', (_where, sentTo, before, after) => {
    const t = createTranslator({
      locale: 'en',
      namespace: 'auth',
      messages: { ...en, auth: { ...en.auth, form: { ...en.auth.form, sentTo } } },
    }) as unknown as Translator<'auth'>;
    expect(loginFormText(t).sentTo).toEqual({ before, after });
  });
});
