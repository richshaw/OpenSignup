import { describe, expect, it } from 'vitest';
import { LOGIN_CODE_MAX_AGE_MS, loginCodeExpiry } from './login-code-lifetime';

describe('loginCodeExpiry', () => {
  const now = new Date('2026-10-20T12:00:00.000Z');

  it('returns the persisted expiry for a short-lived link', () => {
    expect(loginCodeExpiry(new Date(now.getTime() + 60_000), now)).toEqual(
      new Date(now.getTime() + 60_000),
    );
  });

  it('caps expiry at the per-email guess window', () => {
    expect(loginCodeExpiry(new Date(now.getTime() + 60 * 60_000), now)).toEqual(
      new Date(now.getTime() + LOGIN_CODE_MAX_AGE_MS),
    );
  });
});
