import { afterEach, describe, expect, it } from 'vitest';
import { magicComposeEnabled, parseEnv, resetEnvCache } from './env';

const base = {
  DATABASE_URL: 'postgres://x',
  AUTH_SECRET: 'x'.repeat(32),
  AUTH_URL: 'http://localhost:3000',
  EMAIL_FROM: 'test@example.com',
};

describe('parseEnv', () => {
  it('accepts a minimum valid config', () => {
    const env = parseEnv(base);
    expect(env.DATABASE_URL).toBe('postgres://x');
    expect(env.EMAIL_TRANSPORT).toBe('console');
    expect(env.NODE_ENV).toBe('development');
  });

  it('requires DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = base;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('requires AUTH_SECRET to be at least 32 characters', () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });

  it('requires AUTH_URL to be a valid URL', () => {
    expect(() => parseEnv({ ...base, AUTH_URL: 'not-a-url' })).toThrow(/AUTH_URL/);
  });

  it('requires RESEND_API_KEY when transport=resend', () => {
    expect(() => parseEnv({ ...base, EMAIL_TRANSPORT: 'resend' })).toThrow(/RESEND_API_KEY/);
  });

  it('accepts resend with key', () => {
    const env = parseEnv({ ...base, EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_abc' });
    expect(env.EMAIL_TRANSPORT).toBe('resend');
  });

  it('requires SMTP_HOST and SMTP_PORT when transport=smtp', () => {
    expect(() => parseEnv({ ...base, EMAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_HOST/);
  });

  it('accepts smtp with host and port', () => {
    const env = parseEnv({
      ...base,
      EMAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
    });
    expect(env.EMAIL_TRANSPORT).toBe('smtp');
    expect(env.SMTP_PORT).toBe(587);
  });

  it('defaults AUTH_MAGIC_LINK_MAX_AGE_MINUTES to 60', () => {
    const env = parseEnv(base);
    expect(env.AUTH_MAGIC_LINK_MAX_AGE_MINUTES).toBe(60);
  });

  it('coerces AUTH_MAGIC_LINK_MAX_AGE_MINUTES from a string', () => {
    const env = parseEnv({ ...base, AUTH_MAGIC_LINK_MAX_AGE_MINUTES: '15' });
    expect(env.AUTH_MAGIC_LINK_MAX_AGE_MINUTES).toBe(15);
  });

  it('rejects AUTH_MAGIC_LINK_MAX_AGE_MINUTES below 1', () => {
    expect(() => parseEnv({ ...base, AUTH_MAGIC_LINK_MAX_AGE_MINUTES: '0' })).toThrow(
      /AUTH_MAGIC_LINK_MAX_AGE_MINUTES/,
    );
  });

  it('rejects AUTH_MAGIC_LINK_MAX_AGE_MINUTES above 10080', () => {
    expect(() => parseEnv({ ...base, AUTH_MAGIC_LINK_MAX_AGE_MINUTES: '20000' })).toThrow(
      /AUTH_MAGIC_LINK_MAX_AGE_MINUTES/,
    );
  });

  it('rejects LLM_BASE_URL without LLM_MODEL', () => {
    expect(() =>
      parseEnv({ ...base, LLM_BASE_URL: 'https://api.openai.com/v1' }),
    ).toThrow(/LLM_MODEL/);
  });

  it('rejects LLM_MODEL without LLM_BASE_URL', () => {
    expect(() => parseEnv({ ...base, LLM_MODEL: 'gpt-4o-mini' })).toThrow(/LLM_BASE_URL/);
  });

  it('accepts LLM_BASE_URL + LLM_MODEL together', () => {
    const env = parseEnv({
      ...base,
      LLM_BASE_URL: 'https://api.openai.com/v1',
      LLM_MODEL: 'gpt-4o-mini',
    });
    expect(env.LLM_BASE_URL).toBe('https://api.openai.com/v1');
    expect(env.LLM_MODEL).toBe('gpt-4o-mini');
    expect(env.LLM_API_KEY).toBeUndefined();
  });

  it('rejects GOOGLE_CLIENT_ID without GOOGLE_CLIENT_SECRET', () => {
    expect(() => parseEnv({ ...base, GOOGLE_CLIENT_ID: 'id' })).toThrow(/GOOGLE_CLIENT_SECRET/);
  });

  it('rejects GOOGLE_CLIENT_SECRET without GOOGLE_CLIENT_ID', () => {
    expect(() => parseEnv({ ...base, GOOGLE_CLIENT_SECRET: 'secret' })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('accepts GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET together', () => {
    const env = parseEnv({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
    expect(env.GOOGLE_CLIENT_ID).toBe('id');
    expect(env.GOOGLE_CLIENT_SECRET).toBe('secret');
  });

});

describe('magicComposeEnabled', () => {
  const originalEnv = { ...process.env };

  function setBaseEnv(): void {
    process.env.DATABASE_URL = 'postgres://x';
    process.env.AUTH_SECRET = 'x'.repeat(32);
    process.env.AUTH_URL = 'http://localhost:3000';
    process.env.EMAIL_FROM = 'test@example.com';
    process.env.EMAIL_TRANSPORT = 'console';
  }

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCache();
  });

  it('returns true when LLM_BASE_URL and LLM_MODEL are both set', () => {
    setBaseEnv();
    process.env.LLM_BASE_URL = 'https://api.openai.com/v1';
    process.env.LLM_MODEL = 'gpt-4o-mini';
    resetEnvCache();
    expect(magicComposeEnabled()).toBe(true);
  });

  it('returns false when both LLM_BASE_URL and LLM_MODEL are unset', () => {
    setBaseEnv();
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    resetEnvCache();
    expect(magicComposeEnabled()).toBe(false);
  });
});
