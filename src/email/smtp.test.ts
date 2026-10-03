import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { SmtpTransport, smtpTransportOptions } from './smtp';

const cfg = { host: 'smtp.example.com', port: 587, from: 'hello@example.com' };
const login = { user: 'user', password: 'not-a-real-password' };

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

  it.each([
    ['a login on 587', true, { ...login }],
    ['a login on 25', true, { ...login, port: 25 }],
    ['a login and SMTP_REQUIRE_TLS=false', false, { ...login, requireTls: false }],
    ['no login', false, {}],
    ['no login and SMTP_REQUIRE_TLS=true', true, { requireTls: true }],
    // TLS from the first byte: there is no plain-text phase to upgrade.
    ['a login on 465', false, { ...login, port: 465 }],
    ['a login and SMTP_SECURE=true', false, { ...login, secure: true }],
  ])('with %s, requires STARTTLS: %s', (_case, expected, overrides) => {
    expect(smtpTransportOptions({ ...cfg, ...overrides }).requireTLS).toBe(expected);
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

/**
 * A mail server that takes a login but offers no STARTTLS, and refuses it when
 * asked. Records every command it is sent.
 */
async function startServerWithoutStarttls() {
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('220 mail.example.com ESMTP\r\n');
    let buffered = '';
    socket.on('data', (chunk) => {
      buffered += chunk.toString('latin1');
      for (let end = buffered.indexOf('\r\n'); end >= 0; end = buffered.indexOf('\r\n')) {
        const command = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);
        commands.push(command);
        if (/^EHLO /i.test(command)) socket.write('250-mail.example.com\r\n250 AUTH PLAIN\r\n');
        else if (/^QUIT/i.test(command)) socket.end('221 Bye\r\n');
        else socket.write('502 Command not implemented\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return {
    port: address.port,
    commands,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

describe('SmtpTransport against a server without STARTTLS', () => {
  let server: Awaited<ReturnType<typeof startServerWithoutStarttls>> | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  const message = { to: 'pat@example.com', subject: 'Sign in', html: '<p>Hi</p>', text: 'Hi' };

  it('fails the send rather than logging in unencrypted', async () => {
    server = await startServerWithoutStarttls();
    const transport = new SmtpTransport({ ...cfg, ...login, host: '127.0.0.1', port: server.port });

    await expect(transport.send(message)).rejects.toMatchObject({
      code: 'ETLS',
      message: expect.stringContaining('STARTTLS'),
    });
    expect(server.commands.some((c) => /^STARTTLS$/i.test(c))).toBe(true);
    expect(server.commands.some((c) => /^AUTH/i.test(c))).toBe(false);
  });

  it('logs in unencrypted when SMTP_REQUIRE_TLS=false allows it', async () => {
    server = await startServerWithoutStarttls();
    const transport = new SmtpTransport({
      ...cfg,
      ...login,
      requireTls: false,
      host: '127.0.0.1',
      port: server.port,
    });

    // This server refuses the login too; reaching AUTH is the point.
    await expect(transport.send(message)).rejects.toMatchObject({ code: 'EAUTH' });
    expect(server.commands.some((c) => /^AUTH/i.test(c))).toBe(true);
  });
});
