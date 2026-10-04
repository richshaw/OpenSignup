import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { smtpTransportOptions } from './smtp';

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

  it('gives up on a host that is down in seconds, not minutes', () => {
    const options = smtpTransportOptions(cfg);
    expect(options.dnsTimeout).toBeLessThanOrEqual(10_000);
    expect(options.connectionTimeout).toBeLessThanOrEqual(10_000);
  });

  it("leaves a server that has answered to nodemailer's defaults", () => {
    // A send that times out after the relay accepted it is retried, so a tight
    // limit here would turn a slow relay into duplicate reminders.
    const options = smtpTransportOptions(cfg);
    expect(options.greetingTimeout).toBeUndefined();
    expect(options.socketTimeout).toBeUndefined();
  });

  it('refuses file paths and URLs as message content', () => {
    const options = smtpTransportOptions(cfg);
    expect(options.disableFileAccess).toBe(true);
    expect(options.disableUrlAccess).toBe(true);
  });
});

// The other email tests mock nodemailer, so a major version bump could not fail
// them. These build a real transport from our options; jsonTransport composes
// the message without opening a connection.
describe('smtpTransportOptions with the real nodemailer', () => {
  const transport = () =>
    nodemailer.createTransport({ ...smtpTransportOptions(cfg), jsonTransport: true });
  const message = { from: cfg.from, to: 'pat@example.com', subject: 'Hello' };

  it('sends a message and reports its id', async () => {
    const info = await transport().sendMail({ ...message, text: 'Hi', html: '<p>Hi</p>' });
    expect(info.messageId).toMatch(/^<.+@.+>$/);
  });

  it('refuses a file path as message content', async () => {
    await expect(
      transport().sendMail({ ...message, text: { path: 'package.json' } }),
    ).rejects.toMatchObject({ code: 'EFILEACCESS' });
  });
});
