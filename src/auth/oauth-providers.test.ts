import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/lib/env';
import { enabledOAuthProviders } from './oauth-providers';

const base = {
  DATABASE_URL: 'postgres://x',
  AUTH_SECRET: 'x'.repeat(32),
  AUTH_URL: 'http://localhost:3000',
  EMAIL_FROM: 'test@example.com',
};

describe('enabledOAuthProviders', () => {
  it('returns no providers when none are configured', () => {
    expect(enabledOAuthProviders(parseEnv(base))).toEqual([]);
  });

  it('enables Google when both client id and secret are set', () => {
    const env = parseEnv({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
    expect(enabledOAuthProviders(env)).toEqual([{ id: 'google', label: 'Google' }]);
  });

  it('treats empty-string credentials as not configured (truthiness, not defined)', () => {
    const env = parseEnv({ ...base, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
    expect(enabledOAuthProviders(env)).toEqual([]);
  });

  it('requires both halves — a client id alone does not enable Google', () => {
    // Bypasses parseEnv (which would reject this pair) to exercise the registry guard directly.
    const env = { ...parseEnv(base), GOOGLE_CLIENT_ID: 'id' };
    expect(enabledOAuthProviders(env)).toEqual([]);
  });
});
