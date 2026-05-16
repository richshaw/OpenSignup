import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

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
});
