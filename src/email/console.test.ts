import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '@/lib/log';
import { ConsoleTransport, redactUrlQueryStrings } from './console';

vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  getEnv: () => ({ NODE_ENV: 'production' }),
}));

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

describe('redactSignInCodes', () => {
  it('blanks standalone six-digit codes and leaves other numbers alone', async () => {
    const { redactSignInCodes } = await import('./console');
    expect(redactSignInCodes('Type this code: 862803 now')).toBe('Type this code: [redacted] now');
    expect(redactSignInCodes('order 1234567 on 12/03/2026 for 12 people')).toBe(
      'order 1234567 on 12/03/2026 for 12 people',
    );
  });
});

describe('ConsoleTransport addresses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The fields the transport logged for `msg`. */
  async function logged(msg: Parameters<ConsoleTransport['send']>[0]) {
    const info = vi.spyOn(log, 'info').mockImplementation(() => undefined);
    await new ConsoleTransport('hello@example.com').send(msg);
    return info.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
  }

  const message = { to: 'pat@example.com', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' };

  it('logs EMAIL_FROM, and no reply-to, when the email names neither', async () => {
    const fields = await logged(message);
    expect(fields.from).toBe('hello@example.com');
    expect(fields.replyTo).toBeUndefined();
  });

  it("logs the email's own address and reply-to when it names them", async () => {
    const fields = await logged({
      ...message,
      from: 'Pat at Example <pat@example.com>',
      replyTo: 'pat.inbox@example.com',
    });
    expect(fields.from).toBe('Pat at Example <pat@example.com>');
    expect(fields.replyTo).toBe('pat.inbox@example.com');
  });

  it('takes a blank address as none', async () => {
    const fields = await logged({ ...message, from: '', replyTo: '' });
    expect(fields.from).toBe('hello@example.com');
    expect(fields.replyTo).toBeUndefined();
  });
});
