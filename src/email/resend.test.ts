import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResendTransport } from './resend';

const message = { to: 'pat@example.com', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' };

/** Sends `msg` through a transport whose fetch is stubbed, and returns the JSON body it posted. */
async function postedBody(msg: Parameters<ResendTransport['send']>[0]) {
  const fetchMock = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const result = await new ResendTransport('re_not_a_real_key', 'hello@example.com').send(msg);
  expect(result).toEqual({ id: 'email_1', transport: 'resend' });
  const init = fetchMock.mock.calls[0]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe('ResendTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends from EMAIL_FROM, with no reply-to, when the email names neither', async () => {
    const body = await postedBody(message);
    expect(body.from).toBe('hello@example.com');
    expect(body).not.toHaveProperty('reply_to');
  });

  it("sends from the email's own address, with its reply-to, when it names them", async () => {
    const body = await postedBody({
      ...message,
      from: 'Pat at Example <pat@example.com>',
      replyTo: 'pat.inbox@example.com',
    });
    expect(body.from).toBe('Pat at Example <pat@example.com>');
    expect(body.reply_to).toBe('pat.inbox@example.com');
  });

  it.each(['', '   '])('takes %j as no address', async (blank) => {
    const body = await postedBody({ ...message, from: blank, replyTo: blank });
    expect(body.from).toBe('hello@example.com');
    expect(body).not.toHaveProperty('reply_to');
  });

  it('drops the spaces around an address', async () => {
    const body = await postedBody({
      ...message,
      from: '  Pat at Example <pat@example.com> ',
      replyTo: ' pat.inbox@example.com ',
    });
    expect(body.from).toBe('Pat at Example <pat@example.com>');
    expect(body.reply_to).toBe('pat.inbox@example.com');
  });
});
