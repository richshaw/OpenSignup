import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderEmail } from '@/email/render';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { formatDuration } from '@/lib/format-duration';
import { MagicLinkEmail, type MagicLinkEmailProps } from './magic-link';

/**
 * English from the catalog, throwing on anything the translator would
 * report, and any other language answered with where each message was asked
 * for and what it was given (`auth.email.code in sv {"duration":"15
 * minuter"}`). So a test in another language sees which text came from the
 * catalog in it, and with which values, whatever its catalog holds so far.
 */
vi.mock('@/i18n/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/server')>();
  const { getTestTranslator } = await import('@/i18n/testing/translator');
  const getServerTranslator = (locale: string, namespace: 'auth.email'): unknown => {
    if (locale === 'en') return getTestTranslator(namespace);
    const answer = (key: string, values: Record<string, unknown> = {}) => {
      const given = Object.entries(values).filter(([, value]) => typeof value !== 'function');
      const shown = given.length > 0 ? ` ${JSON.stringify(Object.fromEntries(given))}` : '';
      return `${namespace}.${key} in ${locale}${shown}`;
    };
    return Object.assign(answer, { rich: answer, markup: answer });
  };
  return { ...actual, getServerTranslator };
});

type Assert<T extends true> = T;
type CodeWithoutExpiry = Omit<MagicLinkEmailProps, 'code' | 'codeExpiresInMinutes'> & {
  code: string;
};
export type CodeExpiryMustBeRequired = Assert<
  CodeWithoutExpiry extends MagicLinkEmailProps ? false : true
>;

/** The email's plain text with its 80-column wrapping undone. */
const flat = (text: string) => text.replace(/\s+/g, ' ');

// Under the db config only because that is where JSX is compiled for
// templates (see vitest.db.config.ts); it touches no database.
describe('MagicLinkEmail', () => {
  it('shows the sign-in code in both html and text when given one', async () => {
    const { html, text } = await renderEmail(
      createElement(MagicLinkEmail, {
        locale: 'en',
        url: 'https://signup.example/login/confirm?next=x',
        email: 'a@example.com',
        expiresInMinutes: 60,
        codeExpiresInMinutes: 15,
        code: '862803',
      }),
    );
    expect(html).toContain('862803');
    expect(text).toContain('862803');
    expect(text).toMatch(/different device/i);
  });

  it('states the code lifetime from its persisted expiry independently of the link lifetime', async () => {
    const short = await renderEmail(
      createElement(MagicLinkEmail, {
        locale: 'en',
        url: 'https://signup.example/x',
        email: 'a@example.com',
        expiresInMinutes: 10,
        codeExpiresInMinutes: 2,
        code: '862803',
      }),
    );
    expect(flat(short.text)).toContain('expire in 10 minutes');
    expect(flat(short.text)).toContain('It works for 2 minutes:');

    const long = await renderEmail(
      createElement(MagicLinkEmail, {
        locale: 'en',
        url: 'https://signup.example/x',
        email: 'a@example.com',
        expiresInMinutes: 60,
        codeExpiresInMinutes: 15,
        code: '862803',
      }),
    );
    expect(flat(long.text)).toContain('It works for 15 minutes:');
  });

  it('is the English it always was, word for word', async () => {
    const url = 'https://signup.example/login/confirm?token=abc&x=1';
    const { html, text } = await renderEmail(
      createElement(MagicLinkEmail, {
        locale: 'en',
        url,
        email: 'pat@example.com',
        expiresInMinutes: 60,
        codeExpiresInMinutes: 15,
        code: '862803',
      }),
    );
    // The plain text as it read before its words moved to the catalog,
    // wrapping and all.
    expect(text).toBe(
      [
        'OpenSignup',
        '',
        '-'.repeat(80),
        '',
        '',
        'SIGN IN TO OPENSIGNUP',
        '',
        'Click the button below to sign in as pat@example.com. This link will expire in 1',
        'hour.',
        '',
        `Sign in ${url}`,
        '',
        'Reading this on a different device? Type this code into the window where you',
        'started signing in instead. It works for 15 minutes:',
        '',
        '862803',
        '',
        'Or copy this URL:',
        url,
      ].join('\n'),
    );
    expect(html).toMatch(/<html[^>]* lang="en"/);
    // The preview text inboxes show after the subject.
    expect(html).toContain('>Sign in to OpenSignup as pat@example.com<');
    expect(html).toContain(
      'Click the button below to sign in as <strong>pat@example.com</strong>. This link will expire in 1 hour.',
    );
  });

  it.each(TEST_LOCALES)('takes every word from the catalog in %s', async (locale) => {
    const url = 'https://signup.example/login/confirm?token=abc';
    const { html, text } = await renderEmail(
      createElement(MagicLinkEmail, {
        locale,
        url,
        email: 'pat@example.com',
        expiresInMinutes: 90,
        codeExpiresInMinutes: 15,
        code: '862803',
      }),
    );
    // Each lifetime is written in the email's language too.
    const intro = { email: 'pat@example.com', duration: formatDuration(90, locale) };
    const code = { duration: formatDuration(15, locale) };
    expect(html).toMatch(new RegExp(`<html[^>]* lang="${locale}"`));
    expect(flat(text)).toBe(
      [
        'OpenSignup',
        '-'.repeat(80),
        `auth.email.heading in ${locale}`.toUpperCase(),
        `auth.email.intro in ${locale} ${JSON.stringify(intro)}`,
        `auth.email.signIn in ${locale} ${url}`,
        `auth.email.code in ${locale} ${JSON.stringify(code)}`,
        '862803',
        `auth.email.copyUrl in ${locale}`,
        url,
      ].join(' '),
    );
    expect(html).toContain(
      `>auth.email.preview in ${locale} {&quot;email&quot;:&quot;pat@example.com&quot;}<`,
    );
  });
});
