import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '@/email/render';
import { MagicLinkEmail } from './magic-link';

// Under the db config only because that is where JSX is compiled for
// templates (see vitest.db.config.ts); it touches no database.
describe('MagicLinkEmail', () => {
  it('shows the sign-in code in both html and text when given one', async () => {
    const { html, text } = await renderEmail(
      createElement(MagicLinkEmail, {
        url: 'https://signup.example/login/confirm?next=x',
        email: 'a@example.com',
        expiresInMinutes: 60,
        code: '862803',
      }),
    );
    expect(html).toContain('862803');
    expect(text).toContain('862803');
    expect(text).toMatch(/different device/i);
  });

  it('omits the code section when no code is given', async () => {
    const { text } = await renderEmail(
      createElement(MagicLinkEmail, { url: 'https://signup.example/x', email: 'a@example.com' }),
    );
    expect(text).not.toMatch(/different device/i);
  });
});
