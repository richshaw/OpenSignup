import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import { logOptions } from '@/lib/log';
import { ResendTransport } from './resend';
import type { EmailMessage, EmailResult, EmailTransport } from './transport';

let transport: EmailTransport;
vi.mock('./index', () => ({ getEmailTransport: () => transport }));

const { sendCommitmentConfirmation, sendReminder, sendSlotChanged } = await import('./send');

const to = 'pat@example.com';
const common = {
  locale: 'en' as const,
  participantName: 'Pat',
  signupTitle: 'Saturday Snack Rotation',
  manageUrl: 'https://example.test/s/snacks/c/com_1?token=abc',
  slotDetails: [{ label: 'Snack', value: 'Fruit' }],
  slotSummary: 'Fruit',
  notes: null,
  quantity: 1,
};
const unsubscribe = {
  unsubscribeUrl: 'https://example.test/s/snacks/unsubscribe?p=par_1&token=abc',
};
const opts = { unsubscribePostUrl: 'https://example.test/api/unsubscribe?token=abc' };

const sends: Record<string, () => Promise<EmailResult>> = {
  sendCommitmentConfirmation: () =>
    sendCommitmentConfirmation(to, { ...common, promisesReminder: false }),
  sendReminder: () => sendReminder(to, { ...common, ...unsubscribe }, opts),
  sendSlotChanged: () =>
    sendSlotChanged(
      to,
      { ...common, ...unsubscribe, slotDetails: [{ label: 'Day', value: 'Sat, Sep 5' }] },
      opts,
    ),
};

/** A nodemailer-style refusal: the address is in its message, `response` and `rejected`. */
function nodemailerRefusal() {
  return Object.assign(
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
}

/** What the production logger writes for `{ err }`, through its own serializers and hooks. */
function logged(err: unknown) {
  const lines: string[] = [];
  pino(logOptions, { write: (line: string) => void lines.push(line) }).error(
    { err },
    'email failed',
  );
  return lines.join('');
}

async function rejection(send: () => Promise<EmailResult>) {
  const reason = await send().then(
    () => null,
    (e: unknown) => e,
  );
  expect(reason).toBeInstanceOf(Error);
  return reason as Error;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(Object.keys(sends))('%s, when the mail server refuses the address', (name) => {
  const send = sends[name]!;

  beforeEach(() => {
    transport = {
      send: async (_message: EmailMessage) => {
        throw nodemailerRefusal();
      },
    };
  });

  it("rejects with the refusal and its codes, but not the recipient's address", async () => {
    const refusal = await rejection(send);
    expect(refusal.message).toBe(
      "Can't send mail - all recipients were rejected: 550 5.1.1 <[email]>: Recipient address rejected",
    );
    expect({ ...refusal }).toEqual({ code: 'EENVELOPE', responseCode: 550 });
    const line = logged(refusal);
    expect(line).toContain('EENVELOPE');
    expect(line).not.toContain('pat@example.com');
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
    transport = new ResendTransport('re_not_a_real_key', 'OpenSignup <noreply@example.org>');
    const refusal = await rejection(send);
    expect(refusal.message).toMatch(/^resend send failed \(422\): /);
    const line = logged(refusal);
    expect(line).toContain('validation_error');
    expect(line).not.toContain('pat@example.com');
  });
});

describe('a participant email that goes out', () => {
  it('resolves with what the transport returned', async () => {
    transport = { send: async () => ({ id: 'msg-1', transport: 'smtp' }) };
    await expect(sends.sendReminder!()).resolves.toEqual({ id: 'msg-1', transport: 'smtp' });
  });
});
