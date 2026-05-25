import { describe, expect, it } from 'vitest';
import { parseSiteConfig } from './site-config';

const base = {
  NEXT_PUBLIC_INSTANCE_NAME: 'Acme Signups',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'hello@acme.example',
  NEXT_PUBLIC_SOURCE_URL: 'https://github.com/acme/signup',
  NEXT_PUBLIC_GOVERNING_LAW: 'the State of California, United States',
};

describe('parseSiteConfig', () => {
  it('accepts a minimum valid config', () => {
    const config = parseSiteConfig(base);
    expect(config.INSTANCE_NAME).toBe('Acme Signups');
    expect(config.SUPPORT_EMAIL).toBe('hello@acme.example');
    expect(config.SOURCE_URL).toBe('https://github.com/acme/signup');
    expect(config.GOVERNING_LAW).toBe('the State of California, United States');
    expect(config.OPERATOR_NAME).toBeNull();
  });

  it.each([
    'NEXT_PUBLIC_INSTANCE_NAME',
    'NEXT_PUBLIC_SUPPORT_EMAIL',
    'NEXT_PUBLIC_SOURCE_URL',
    'NEXT_PUBLIC_GOVERNING_LAW',
  ] as const)('reports missing %s with a consistent "is required" message', (key) => {
    const { [key]: _omit, ...rest } = base;
    expect(() => parseSiteConfig(rest)).toThrow(new RegExp(`${key} is required`));
  });

  it.each([
    'NEXT_PUBLIC_INSTANCE_NAME',
    'NEXT_PUBLIC_GOVERNING_LAW',
  ] as const)('reports empty %s with the same "is required" message', (key) => {
    expect(() => parseSiteConfig({ ...base, [key]: '' })).toThrow(
      new RegExp(`${key} is required`),
    );
  });

  it('rejects a malformed email', () => {
    expect(() =>
      parseSiteConfig({ ...base, NEXT_PUBLIC_SUPPORT_EMAIL: 'not-an-email' }),
    ).toThrow(/NEXT_PUBLIC_SUPPORT_EMAIL/);
  });

  it('rejects a non-https source URL', () => {
    expect(() =>
      parseSiteConfig({ ...base, NEXT_PUBLIC_SOURCE_URL: 'http://example.com' }),
    ).toThrow(/https/);
  });

  it('rejects javascript: source URL', () => {
    expect(() =>
      parseSiteConfig({ ...base, NEXT_PUBLIC_SOURCE_URL: 'javascript:alert(1)' }),
    ).toThrow(/NEXT_PUBLIC_SOURCE_URL/);
  });

  it('passes through a non-blank operator name', () => {
    const config = parseSiteConfig({ ...base, NEXT_PUBLIC_OPERATOR_NAME: 'Acme Co.' });
    expect(config.OPERATOR_NAME).toBe('Acme Co.');
  });

  it('trims surrounding whitespace from operator name', () => {
    const config = parseSiteConfig({ ...base, NEXT_PUBLIC_OPERATOR_NAME: '  Acme Co.  ' });
    expect(config.OPERATOR_NAME).toBe('Acme Co.');
  });

  it.each(['', '   ', '\t\n'])(
    'normalises blank operator name %j to null',
    (blank) => {
      const config = parseSiteConfig({ ...base, NEXT_PUBLIC_OPERATOR_NAME: blank });
      expect(config.OPERATOR_NAME).toBeNull();
    },
  );

  it('reports every failing field in a single error', () => {
    expect(() =>
      parseSiteConfig({
        NEXT_PUBLIC_INSTANCE_NAME: '',
        NEXT_PUBLIC_SUPPORT_EMAIL: 'bad',
        NEXT_PUBLIC_SOURCE_URL: 'http://insecure',
        NEXT_PUBLIC_GOVERNING_LAW: '',
      }),
    ).toThrow(
      /NEXT_PUBLIC_INSTANCE_NAME[\s\S]*NEXT_PUBLIC_SUPPORT_EMAIL[\s\S]*NEXT_PUBLIC_SOURCE_URL[\s\S]*NEXT_PUBLIC_GOVERNING_LAW/,
    );
  });
});
