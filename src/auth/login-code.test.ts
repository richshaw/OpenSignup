import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({ getEnv: () => ({ AUTH_SECRET: 's'.repeat(32) }) }));

import {
  LOGIN_CODE_LENGTH,
  decryptCallbackUrl,
  encryptCallbackUrl,
  generateLoginCode,
  hashLoginCode,
  normalizeLoginCode,
} from './login-code';

describe('generateLoginCode', () => {
  it('is six digits, zero-padded, and not obviously repeating', () => {
    const codes = new Set(Array.from({ length: 200 }, generateLoginCode));
    for (const c of codes) expect(c).toMatch(new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`));
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe('normalizeLoginCode', () => {
  it('accepts spaced and dashed input, rejects anything else', () => {
    expect(normalizeLoginCode('123456')).toBe('123456');
    expect(normalizeLoginCode(' 123 456 ')).toBe('123456');
    expect(normalizeLoginCode('123-456')).toBe('123456');
    expect(normalizeLoginCode('12345')).toBeNull();
    expect(normalizeLoginCode('1234567')).toBeNull();
    expect(normalizeLoginCode('12a456')).toBeNull();
  });
});

describe('hashLoginCode', () => {
  it('is keyed to the (normalised) email, so a code cannot be replayed for another address', () => {
    expect(hashLoginCode('A@Example.com', '123456')).toBe(hashLoginCode(' a@example.com', '123456'));
    expect(hashLoginCode('a@example.com', '123456')).not.toBe(hashLoginCode('b@example.com', '123456'));
    expect(hashLoginCode('a@example.com', '123456')).not.toBe(hashLoginCode('a@example.com', '123457'));
  });
});

describe('callback url encryption', () => {
  it('round-trips and rejects tampering', () => {
    const url = 'https://signup.example/api/auth/callback/nodemailer?token=abc&email=a%40b.c';
    const blob = encryptCallbackUrl(url);
    expect(blob).not.toContain('token=abc');
    expect(decryptCallbackUrl(blob)).toBe(url);
    const [iv, tag, body] = blob.split('.');
    expect(decryptCallbackUrl(`${iv}.${tag}.${body!.slice(0, -2)}AA`)).toBeNull();
    expect(decryptCallbackUrl('garbage')).toBeNull();
    expect(decryptCallbackUrl(blob, 'x'.repeat(32))).toBeNull();
  });
});
