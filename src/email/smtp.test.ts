import { createServer, type Server, type Socket } from 'node:net';
import nodemailer from 'nodemailer';
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

  it('keeps a small pool of connections open between emails', () => {
    const options = smtpTransportOptions(cfg);
    expect(options.pool).toBe(true);
    expect(options.maxConnections).toBe(3);
    expect(options.maxMessages).toBe(100);
  });

  it('retries an email at most once when its connection closes mid-send', () => {
    // nodemailer's default is to put it back in the queue forever.
    expect(smtpTransportOptions(cfg).maxRequeues).toBe(1);
  });
});

const EHLO_WITHOUT_STARTTLS = '250-mail.example.com\r\n250 AUTH PLAIN\r\n';

/**
 * A mail server that answers EHLO with `ehloReply`, by default a login offer
 * without STARTTLS, and refuses every other command but QUIT: STARTTLS and the
 * login included. Records every command it is sent.
 */
async function startServerWithoutStarttls(ehloReply = EHLO_WITHOUT_STARTTLS) {
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    // A client that resets the connection must not crash the test run.
    socket.on('error', () => {});
    socket.write('220 mail.example.com ESMTP\r\n');
    let buffered = '';
    socket.on('data', (chunk) => {
      buffered += chunk.toString('latin1');
      for (let end = buffered.indexOf('\r\n'); end >= 0; end = buffered.indexOf('\r\n')) {
        const command = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);
        commands.push(command);
        if (/^EHLO /i.test(command)) socket.write(ehloReply);
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
  const hint =
    'The mail server did not accept STARTTLS. If it takes a login without encryption on a network you trust, set SMTP_REQUIRE_TLS=false.';

  async function sendError(transport: SmtpTransport) {
    const error: unknown = await transport.send(message).then(
      () => expect.fail('the send went through'),
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(Error);
    return error as Error & { code?: string };
  }

  it.each([
    ['refuses STARTTLS', 'STARTTLS', EHLO_WITHOUT_STARTTLS, 'ETLS'],
    ['refuses EHLO', 'EHLO', '502 Command not implemented\r\n', 'ECONNECTION'],
  ])(
    'fails the send rather than logging in unencrypted when the server %s',
    async (_case, lastCommand, ehloReply, code) => {
      server = await startServerWithoutStarttls(ehloReply);
      const transport = new SmtpTransport({
        ...cfg,
        ...login,
        host: '127.0.0.1',
        port: server.port,
      });

      const error = await sendError(transport);
      // nodemailer's error, then what to do about it.
      expect(error).toMatchObject({ code, cause: { code } });
      expect(error.message).toBe(`${(error.cause as Error).message}. ${hint}`);
      expect(server.commands.at(-1)).toMatch(new RegExp(`^${lastCommand}\\b`, 'i'));
      expect(server.commands.some((c) => /^AUTH/i.test(c))).toBe(false);
    },
  );

  it('adds no hint when STARTTLS was not required', async () => {
    // Offered, then refused. nodemailer tries STARTTLS whenever it is offered,
    // so SMTP_REQUIRE_TLS=false would not help here.
    server = await startServerWithoutStarttls(
      '250-mail.example.com\r\n250-STARTTLS\r\n250 AUTH PLAIN\r\n',
    );
    const transport = new SmtpTransport({
      ...cfg,
      ...login,
      requireTls: false,
      host: '127.0.0.1',
      port: server.port,
    });

    const error = await sendError(transport);
    expect(error.code).toBe('ETLS');
    expect(error.cause).toBeUndefined();
    expect(error.message).not.toContain('SMTP_REQUIRE_TLS');
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

    // This server refuses the login too; reaching AUTH is the point, and
    // nothing goes out after the refusal.
    await expect(transport.send(message)).rejects.toMatchObject({ code: 'EAUTH' });
    expect(server.commands.some((c) => /^AUTH/i.test(c))).toBe(true);
    expect(server.commands.some((c) => /^MAIL FROM/i.test(c))).toBe(false);
  });
});

/**
 * A mail server that takes every message without a login or TLS, as a local
 * test mail server does. Counts the connections made to it and the messages
 * it took. `closeAfterEach` hangs up after each message, the way a server
 * drops a connection that has sat idle.
 */
async function startAcceptingServer({ closeAfterEach = false } = {}) {
  let connections = 0;
  const delivered: string[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.write('220 mail.example.com ESMTP\r\n');
    let buffered = '';
    let inData = false;
    let to = '';
    socket.on('data', (chunk) => {
      buffered += chunk.toString('latin1');
      for (let end = buffered.indexOf('\r\n'); end >= 0; end = buffered.indexOf('\r\n')) {
        const line = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);
        if (inData) {
          if (line !== '.') continue;
          inData = false;
          delivered.push(to);
          socket.write('250 Queued\r\n');
          if (closeAfterEach) socket.end();
        } else if (/^EHLO /i.test(line)) socket.write('250-mail.example.com\r\n250 8BITMIME\r\n');
        else if (/^RCPT TO:/i.test(line)) {
          to = line.replace(/^RCPT TO:\s*<?([^>]*)>?.*$/i, '$1');
          socket.write('250 OK\r\n');
        } else if (/^(MAIL FROM:|RSET)/i.test(line)) socket.write('250 OK\r\n');
        else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write('354 Go ahead\r\n');
        } else if (/^QUIT/i.test(line)) socket.end('221 Bye\r\n');
        else socket.write('502 Command not implemented\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return {
    port: address.port,
    connections: () => connections,
    delivered,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

describe('SmtpTransport sending several emails', () => {
  let server: Awaited<ReturnType<typeof startAcceptingServer>> | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  const send = (transport: SmtpTransport, to: string) =>
    transport.send({ to, subject: 'Reminder', html: '<p>Hi</p>', text: 'Hi' });
  const recipients = ['pat@example.com', 'sam@example.com', 'alex@example.com'];

  it('sends one after another over a single connection', async () => {
    server = await startAcceptingServer();
    const transport = new SmtpTransport({ ...cfg, host: '127.0.0.1', port: server.port });

    // The reminder worker sends one job at a time, like this.
    for (const to of recipients) await send(transport, to);

    expect(server.delivered).toEqual(recipients);
    expect(server.connections()).toBe(1);
  });

  it('opens a new connection when the server has closed the last one', async () => {
    server = await startAcceptingServer({ closeAfterEach: true });
    const transport = new SmtpTransport({ ...cfg, host: '127.0.0.1', port: server.port });

    for (const to of recipients) {
      await send(transport, to);
      // Give the pool time to see the hang-up, as it would between reminders.
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(server.delivered).toEqual(recipients);
    expect(server.connections()).toBe(3);
  });
});

// The other email tests mock nodemailer, so a major version bump could not fail
// them. These build a real transport from our options, the pooled one we send
// with, against a local server.
describe('smtpTransportOptions with the real nodemailer', () => {
  let server: Awaited<ReturnType<typeof startAcceptingServer>> | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  async function transport() {
    server = await startAcceptingServer();
    return nodemailer.createTransport(
      smtpTransportOptions({ ...cfg, host: '127.0.0.1', port: server.port }),
    );
  }
  const message = { from: cfg.from, to: 'pat@example.com', subject: 'Hello' };

  it('sends a message and reports its id', async () => {
    const info = await (await transport()).sendMail({ ...message, text: 'Hi', html: '<p>Hi</p>' });
    expect(info.messageId).toMatch(/^<.+@.+>$/);
    expect(server?.delivered).toEqual(['pat@example.com']);
  });

  it('refuses a file path as message content', async () => {
    const mailer = await transport();
    // Over SMTP nodemailer reports EFILEACCESS as a stream error, keeping its message.
    await expect(mailer.sendMail({ ...message, text: { path: 'package.json' } })).rejects.toThrow(
      /^File access rejected for package\.json/,
    );
    expect(server?.delivered).toEqual([]);
  });
});
