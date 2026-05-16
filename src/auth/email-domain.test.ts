import { describe, expect, it } from 'vitest';
import { extractEmailDomain } from './email-domain';

describe('extractEmailDomain', () => {
  it('returns the domain after the @', () => {
    expect(extractEmailDomain('user@example.com')).toBe('example.com');
  });

  it('preserves subdomains and case as written', () => {
    expect(extractEmailDomain('a@Mail.Example.CO.UK')).toBe('Mail.Example.CO.UK');
  });

  it('returns "unknown" when there is no @', () => {
    expect(extractEmailDomain('no-at-here')).toBe('unknown');
  });

  it('returns "unknown" for the empty string', () => {
    expect(extractEmailDomain('')).toBe('unknown');
  });

  it('returns "unknown" when the domain part is empty', () => {
    expect(extractEmailDomain('user@')).toBe('unknown');
  });

  it('takes the part after the first @ on malformed input with multiple @', () => {
    expect(extractEmailDomain('a@b@c')).toBe('b');
  });
});
