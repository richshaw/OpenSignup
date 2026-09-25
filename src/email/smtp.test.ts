import { describe, expect, it } from 'vitest';
import {
  SMTP_CONNECTION_TIMEOUT_MS,
  SMTP_GREETING_TIMEOUT_MS,
  SMTP_SOCKET_TIMEOUT_MS,
  smtpTransportOptions,
} from './smtp';

const cfg = { host: 'smtp.example.com', port: 587, from: 'hello@example.com' };

describe('smtpTransportOptions', () => {
  it.each([
    [465, undefined, true],
    [587, undefined, false],
    [25, undefined, false],
    [465, false, false],
    [587, true, true],
  ])('port %i with secure=%s connects with secure=%s', (port, secure, expected) => {
    expect(smtpTransportOptions({ ...cfg, port, secure }).secure).toBe(expected);
  });

  it('gives up on a silent server in seconds, not minutes', () => {
    const options = smtpTransportOptions(cfg);
    expect(options.connectionTimeout).toBe(SMTP_CONNECTION_TIMEOUT_MS);
    expect(options.greetingTimeout).toBe(SMTP_GREETING_TIMEOUT_MS);
    expect(options.socketTimeout).toBe(SMTP_SOCKET_TIMEOUT_MS);
    expect(SMTP_SOCKET_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it('refuses file paths and URLs as message content', () => {
    const options = smtpTransportOptions(cfg);
    expect(options.disableFileAccess).toBe(true);
    expect(options.disableUrlAccess).toBe(true);
  });

  it('only authenticates when both user and password are set', () => {
    expect(smtpTransportOptions({ ...cfg, user: 'u', password: 'p' }).auth).toEqual({
      user: 'u',
      pass: 'p',
    });
    expect(smtpTransportOptions({ ...cfg, user: 'u' }).auth).toBeUndefined();
  });
});
