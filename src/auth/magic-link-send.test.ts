import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailResult } from '@/email/transport';
import { log } from '@/lib/log';
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

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
  error = vi.spyOn(log, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('sendMagicLinkEmail', () => {
  it('sends the message through the transport', async () => {
    const send = vi.fn(async () => ({ id: 'msg-1', transport: 'smtp' as const }));
    await sendMagicLinkEmail({ send }, message);
    expect(send).toHaveBeenCalledExactlyOnceWith(message);
  });

  it('logs that a send which outlived the limit went out', async () => {
    const { transport, succeed } = slowTransport();
    await timeOut(transport);
    expect(warn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);
    succeed({ id: 'msg-1', transport: 'smtp' });
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      { email: 'pat@example.com', elapsedMs: MAGIC_LINK_SEND_TIMEOUT_MS + 5_000 },
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
        email: 'pat@example.com',
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
        email: 'pat@example.com',
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
        email: 'pat@example.com',
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
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
