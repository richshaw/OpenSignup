import { describe, expect, it } from 'vitest';
import { redactUrlQueryStrings } from './console';

describe('redactUrlQueryStrings', () => {
  it('strips the token from a participant edit link', () => {
    const text =
      'View or change your slot\nhttp://localhost:3000/s/snacks/c/com_123?token=SECRETVALUE\n';
    const out = redactUrlQueryStrings(text);
    expect(out).not.toContain('SECRETVALUE');
    expect(out).toContain('http://localhost:3000/s/snacks/c/com_123?[redacted]');
  });

  it('strips the token from a magic-link URL', () => {
    expect(redactUrlQueryStrings('https://app.test/login/confirm?token=abc&email=a@b.c')).toBe(
      'https://app.test/login/confirm?[redacted]',
    );
  });

  it('leaves URLs without a query string alone', () => {
    const text = 'Visit https://app.test/s/snacks for details.';
    expect(redactUrlQueryStrings(text)).toBe(text);
  });

  it('redacts every URL in the body, not just the first', () => {
    const out = redactUrlQueryStrings('a https://x.test/a?token=one b https://y.test/b?token=two');
    expect(out).not.toContain('one');
    expect(out).not.toContain('two');
  });
});
