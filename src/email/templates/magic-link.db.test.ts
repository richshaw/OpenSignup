import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '@/email/render';
import { MagicLinkEmail, type MagicLinkEmailProps } from './magic-link';

type Assert<T extends true> = T;
type CodeWithoutExpiry = Omit<MagicLinkEmailProps, 'code' | 'codeExpiresInMinutes'> & {
  code: string;
};
export type CodeExpiryMustBeRequired = Assert<
  CodeWithoutExpiry extends MagicLinkEmailProps ? false : true
>;

// Under the db config only because that is where JSX is compiled for
// templates (see vitest.db.config.ts); it touches no database.
describe('MagicLinkEmail', () => {
  it('shows the sign-in code in both html and text when given one', async () => {
    const { html, text } = await renderEmail(
      createElement(MagicLinkEmail, {
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
        url: 'https://signup.example/x',
        email: 'a@example.com',
        expiresInMinutes: 10,
        codeExpiresInMinutes: 2,
        code: '862803',
      }),
    );
    const flat = (s: string) => s.replace(/\s+/g, ' ');
    expect(flat(short.text)).toContain('expire in 10 minutes');
    expect(flat(short.text)).toContain('It works for 2 minutes:');

    const long = await renderEmail(
      createElement(MagicLinkEmail, {
        url: 'https://signup.example/x',
        email: 'a@example.com',
        expiresInMinutes: 60,
        codeExpiresInMinutes: 15,
        code: '862803',
      }),
    );
    expect(flat(long.text)).toContain('It works for 15 minutes:');
  });

  it('omits the code section when no code is given', async () => {
    const { text } = await renderEmail(
      createElement(MagicLinkEmail, {
        url: 'https://signup.example/x',
        email: 'a@example.com',
        expiresInMinutes: 60,
      }),
    );
    expect(text).not.toMatch(/different device/i);
  });
});
