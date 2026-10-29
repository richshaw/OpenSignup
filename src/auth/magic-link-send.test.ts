import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from 'next-auth';
import pino from 'pino';
import { ResendTransport } from '@/email/resend';
import type { EmailResult } from '@/email/transport';
import { log } from '@/lib/log';
import { authLogger } from './logger';
import { MAGIC_LINK_SEND_TIMEOUT_MS, sendMagicLinkEmail } from './magic-link-send';

const token = 'not-a-real-token';
const link = `http://localhost:3000/login/confirm?next=${token}`;
const code = '482916';
const message = {
  to: 'pat@example.com',
  subject: 'Sign in to OpenSignup',
  html: `<a href="${link}">Sign in</a> or enter ${code}`,
  text: `Sign in: ${link} or enter ${code}`,
};

/** A transport whose one send ends when the test says so. */
function slowTransport() {
  let succeed!: (result: EmailResult) => void;
  let fail!: (err: unknown) => void;
  const sending = new Promise<EmailResult>((resolve, reject) => {
    succeed = resolve;
    fail = reject;
  });
  return { transport: { send: vi.fn(() => sending) }, succeed, fail };
}

/** Starts the send and lets the limit pass. */
async function timeOut(transport: ReturnType<typeof slowTransport>['transport']) {
  const settled = expect(sendMagicLinkEmail(transport, message)).rejects.toThrow(
    `magic link send timed out after ${MAGIC_LINK_SEND_TIMEOUT_MS / 1000} s`,
  );
  await vi.advanceTimersByTimeAsync(MAGIC_LINK_SEND_TIMEOUT_MS);
  await settled;
}

let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  info = vi.spyOn(log, 'info').mockImplementation(() => {});
  warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
  error = vi.spyOn(log, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sendMagicLinkEmail', () => {
  it('sends the message through the transport', async () => {
    const send = vi.fn(async () => ({ id: 'msg-1', transport: 'smtp' as const }));
    await sendMagicLinkEmail({ send }, message);
    expect(send).toHaveBeenCalledExactlyOnceWith(message);
  });

  it('logs that the link went out, naming only the domain', async () => {
    await sendMagicLinkEmail({ send: async () => ({ id: 'msg-1', transport: 'smtp' }) }, message);
    expect(info).toHaveBeenCalledExactlyOnceWith(
      { emailDomain: 'example.com' },
      'magic link dispatched',
    );
  });

  it('logs that a send which outlived the limit went out', async () => {
    const { transport, succeed } = slowTransport();
    await timeOut(transport);
    expect(warn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);
    succeed({ id: 'msg-1', transport: 'smtp' });
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      { emailDomain: 'example.com', elapsedMs: MAGIC_LINK_SEND_TIMEOUT_MS + 5_000 },
      'magic link dispatched after its send timed out',
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('logs the real error when a send that outlived the limit fails', async () => {
    const { transport, fail } = slowTransport();
    await timeOut(transport);

    const refused = Object.assign(new Error('Invalid login: 535 5.7.8 Authentication failed'), {
      code: 'EAUTH',
      responseCode: 535,
      command: 'AUTH PLAIN',
      rejected: ['pat@example.com'],
    });
    fail(refused);
    await vi.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      {
        emailDomain: 'example.com',
        sendError: {
          message: 'Invalid login: 535 5.7.8 Authentication failed',
          code: 'EAUTH',
          responseCode: 535,
        },
        elapsedMs: MAGIC_LINK_SEND_TIMEOUT_MS,
      },
      'magic link send failed after it timed out',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs the cause a failed fetch keeps the real reason in', async () => {
    const { transport, fail } = slowTransport();
    await timeOut(transport);

    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
      code: 'ECONNREFUSED',
      errno: -111,
      syscall: 'connect',
    });
    fail(new TypeError('fetch failed', { cause: refused }));
    await vi.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      {
        emailDomain: 'example.com',
        sendError: {
          message: 'fetch failed',
          cause: { message: 'connect ECONNREFUSED 127.0.0.1:443', code: 'ECONNREFUSED' },
        },
        elapsedMs: MAGIC_LINK_SEND_TIMEOUT_MS,
      },
      'magic link send failed after it timed out',
    );
  });

  it('logs a late failure that is not an Error', async () => {
    const { transport, fail } = slowTransport();
    await timeOut(transport);

    fail('connection reset');
    await vi.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      {
        emailDomain: 'example.com',
        sendError: { message: 'connection reset' },
        elapsedMs: MAGIC_LINK_SEND_TIMEOUT_MS,
      },
      'magic link send failed after it timed out',
    );
  });

  it('logs neither the sign-in link nor its code, even when the error quotes them', async () => {
    const late = slowTransport();
    await timeOut(late.transport);
    late.succeed({ id: 'msg-1', transport: 'smtp' });
    const failing = slowTransport();
    await timeOut(failing.transport);
    failing.fail(
      new Error(`Message failed: 554 5.7.1 blocked URL ${link}, code ${code}`, {
        cause: new Error(`policy rejected: ${message.text}`),
      }),
    );
    const failingOddly = slowTransport();
    await timeOut(failingOddly.transport);
    failingOddly.fail(`resend send failed (422): ${message.html}`);
    await vi.advanceTimersByTimeAsync(0);

    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledTimes(2);
    const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
    expect(logged).toContain('http://localhost:3000/login/confirm?[redacted]');
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(code);
    expect(logged).not.toContain('pat@example.com');
  });

  it('logs nothing more when the send ends in time', async () => {
    await sendMagicLinkEmail({ send: async () => ({ id: 'msg-1', transport: 'smtp' }) }, message);
    await expect(
      sendMagicLinkEmail(
        {
          send: async () => {
            throw new Error('550 rejected');
          },
        },
        message,
      ),
    ).rejects.toThrow('550 rejected');
    await vi.advanceTimersByTimeAsync(MAGIC_LINK_SEND_TIMEOUT_MS);
    expect(info).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

// Auth.js hands a failed sendVerificationRequest to its logger wrapped in an
// error of its own, with the thrown one as the cause.
class EmailSignInError extends AuthError {
  static type = 'EmailSignInError';
}

/** What authLogger writes for each error, through pino's own serializers. */
function loggedByAuth(...failures: unknown[]) {
  const lines: string[] = [];
  const capture = pino({ level: 'debug' }, { write: (line: string) => void lines.push(line) });
  error.mockImplementation((obj: object, msg: string) => capture.error(obj, msg));
  warn.mockImplementation((msg: string) => capture.warn(msg));
  for (const failure of failures) {
    authLogger.error(failure as Error);
    authLogger.error(
      new EmailSignInError('Read more at https://errors.authjs.dev', { cause: failure as Error }),
    );
  }
  return lines.join('');
}

/** Sends with a transport that refuses at once, and returns what it rejected with. */
async function refusedInTime(send: () => Promise<EmailResult>) {
  const rejection = await sendMagicLinkEmail({ send }, message).catch((e: unknown) => e);
  expect(rejection).toBeInstanceOf(Error);
  return rejection as Error;
}

describe('sendMagicLinkEmail, when the mail server refuses in time', () => {
  it('rejects with the refusal, but not the recipient nodemailer hangs on it', async () => {
    const refusal = await refusedInTime(async () => {
      throw Object.assign(
        new Error(
          "Can't send mail - all recipients were rejected: 550 5.1.1 <pat@example.com>: Recipient address rejected",
        ),
        {
          code: 'EENVELOPE',
          responseCode: 550,
          command: 'RCPT TO',
          response: '550 5.1.1 <pat@example.com>: Recipient address rejected: User unknown',
          rejected: ['pat@example.com'],
          rejectedErrors: [new Error('Recipient command failed: 550 5.1.1 <pat@example.com>')],
        },
      );
    });

    expect(refusal.message).toBe(
      "Can't send mail - all recipients were rejected: 550 5.1.1 <[email]>: Recipient address rejected",
    );
    expect({ ...refusal }).toEqual({ code: 'EENVELOPE', responseCode: 550 });
    const logged = loggedByAuth(refusal);
    expect(logged).toContain('EENVELOPE');
    expect(logged).not.toContain('pat@example.com');
  });

  it("rejects with Resend's refusal, without the address its body names", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              statusCode: 422,
              name: 'validation_error',
              message:
                'Invalid `to` field. The email address needs to follow the `email@example.com` format: pat@example.com',
            }),
            { status: 422 },
          ),
      ),
    );
    const resend = new ResendTransport('re_not_a_real_key', 'OpenSignup <noreply@example.org>');
    const refusal = await refusedInTime(() => resend.send(message));

    expect(refusal.message).toMatch(/^resend send failed \(422\): /);
    const logged = loggedByAuth(refusal);
    expect(logged).toContain('validation_error');
    expect(logged).not.toContain('pat@example.com');
  });

  it('keeps the code of the cause a failed fetch hides the reason in', async () => {
    const refusal = await refusedInTime(async () => {
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
          code: 'ECONNREFUSED',
        }),
      });
    });

    expect(refusal.message).toBe('fetch failed');
    expect(refusal.cause).toMatchObject({
      message: 'connect ECONNREFUSED 127.0.0.1:443',
      code: 'ECONNREFUSED',
    });
  });

  it('blanks an address in a late failure too', async () => {
    const { transport, fail } = slowTransport();
    await timeOut(transport);

    fail(new Error('550 5.1.1 <pat@example.com>... User unknown'));
    await vi.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      {
        emailDomain: 'example.com',
        sendError: { message: '550 5.1.1 <[email]>... User unknown' },
        elapsedMs: MAGIC_LINK_SEND_TIMEOUT_MS,
      },
      'magic link send failed after it timed out',
    );
  });
});
