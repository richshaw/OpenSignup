import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '@/lib/env';

const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail: vi.fn() })));
vi.mock('nodemailer', () => ({ default: { createTransport } }));

const env = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  getEnv: () => env.current,
}));

const base = {
  DATABASE_URL: 'postgres://x',
  AUTH_SECRET: 'x'.repeat(32),
  AUTH_URL: 'http://localhost:3000',
  EMAIL_FROM: 'test@example.com',
  EMAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.example.com',
};

describe('getEmailTransport with EMAIL_TRANSPORT=smtp', () => {
  beforeEach(() => {
    vi.resetModules();
    createTransport.mockClear();
  });

  it.each([
    // Port 465 expects TLS from the first byte. Before this was passed through,
    // an unset or blank SMTP_SECURE became false and every send timed out.
    ['465', undefined, true],
    ['465', '', true],
    ['587', undefined, false],
    ['587', '', false],
    ['465', 'false', false],
    ['587', 'true', true],
  ])('SMTP_PORT=%s SMTP_SECURE=%j connects with secure=%s', async (port, secure, expected) => {
    env.current = parseEnv({
      ...base,
      SMTP_PORT: port,
      ...(secure === undefined ? {} : { SMTP_SECURE: secure }),
    });
    const { getEmailTransport } = await import('./index');
    getEmailTransport();
    expect(createTransport).toHaveBeenCalledOnce();
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: Number(port), secure: expected }),
    );
  });
});
