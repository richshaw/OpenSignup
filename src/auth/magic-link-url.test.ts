import { describe, expect, it } from 'vitest';
import { canonicalizeMagicLinkUrl, buildConfirmationUrl } from './magic-link-url';

describe('canonicalizeMagicLinkUrl', () => {
  it('rewrites a fly.dev origin to the AUTH_URL origin', () => {
    const raw =
      'https://signups.fly.dev/api/auth/callback/nodemailer?token=abc&email=user%40example.com';
    const result = canonicalizeMagicLinkUrl(raw, 'https://opensignup.org');
    expect(result).toBe(
      'https://opensignup.org/api/auth/callback/nodemailer?token=abc&email=user%40example.com',
    );
  });

  it('preserves path, query, and hash', () => {
    const raw = 'http://internal-host/api/auth/callback/nodemailer?token=t&callbackUrl=%2Fapp#frag';
    const result = canonicalizeMagicLinkUrl(raw, 'https://opensignup.org');
    expect(result).toBe(
      'https://opensignup.org/api/auth/callback/nodemailer?token=t&callbackUrl=%2Fapp#frag',
    );
  });

  it('keeps a non-default port from AUTH_URL', () => {
    const raw = 'http://0.0.0.0:3000/api/auth/callback/nodemailer?token=t';
    const result = canonicalizeMagicLinkUrl(raw, 'http://localhost:3000');
    expect(result).toBe('http://localhost:3000/api/auth/callback/nodemailer?token=t');
  });

  it('switches protocol when AUTH_URL is https and request was http', () => {
    const raw = 'http://signups.fly.dev/api/auth/callback/nodemailer?token=t';
    const result = canonicalizeMagicLinkUrl(raw, 'https://opensignup.org');
    expect(result.startsWith('https://opensignup.org/')).toBe(true);
  });
});

describe('buildConfirmationUrl', () => {
  it('wraps the callback URL in a /login/confirm page', () => {
    const callback =
      'https://opensignup.org/api/auth/callback/nodemailer?token=abc&email=user%40example.com';
    const result = buildConfirmationUrl(callback, 'https://opensignup.org');
    const url = new URL(result);
    expect(url.pathname).toBe('/login/confirm');
    expect(url.searchParams.get('next')).toBe(callback);
  });

  it('uses the authUrl origin for the confirmation page', () => {
    const callback =
      'https://opensignup.org/api/auth/callback/nodemailer?token=t&email=a%40b.com';
    const result = buildConfirmationUrl(callback, 'https://opensignup.org');
    expect(result.startsWith('https://opensignup.org/login/confirm')).toBe(true);
  });

  it('preserves token and email in the nested next param', () => {
    const callback =
      'https://opensignup.org/api/auth/callback/nodemailer?token=xyz&email=foo%40bar.com&callbackUrl=%2Fapp';
    const result = buildConfirmationUrl(callback, 'https://opensignup.org');
    const next = new URL(result).searchParams.get('next')!;
    const inner = new URL(next);
    expect(inner.searchParams.get('token')).toBe('xyz');
    expect(inner.searchParams.get('email')).toBe('foo@bar.com');
    expect(inner.searchParams.get('callbackUrl')).toBe('/app');
  });
});
