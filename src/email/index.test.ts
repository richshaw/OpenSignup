import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '@/lib/env';
import { getEmailTransport, resetEmailTransportCache } from './index';

const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail: vi.fn() })));
vi.mock('nodemailer', () => ({ default: { createTransport } }));

const env = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  getEnv: () => env.current,
}));

const smtpEnv = {
  DATABASE_URL: 'postgres://x',
  AUTH_SECRET: 'x'.repeat(32),
  AUTH_URL: 'http://localhost:3000',
  EMAIL_FROM: 'test@example.com',
  EMAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
};

describe('getEmailTransport with EMAIL_TRANSPORT=smtp', () => {
  beforeEach(() => {
    resetEmailTransportCache();
    createTransport.mockClear();
  });

  // The port rule itself is in smtp.test.ts. This checks SMTP_SECURE reaches
  // it: an unset or blank value used to arrive as false, so port 465 spoke
  // plain text to a TLS port and every send timed out.
  it.each([
    [undefined, true],
    ['', true],
    ['false', false],
  ])('SMTP_PORT=465 SMTP_SECURE=%j connects with secure=%s', (secure, expected) => {
    env.current = parseEnv(secure === undefined ? smtpEnv : { ...smtpEnv, SMTP_SECURE: secure });
    getEmailTransport();
    expect(createTransport).toHaveBeenCalledOnce();
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: expected }),
    );
  });
});
