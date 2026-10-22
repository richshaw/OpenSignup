import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  chargeRateLimit: vi.fn(),
}));

import type { Db } from '@/db/client';
import { ServiceException, serviceError } from '@/lib/errors';
import { log } from '@/lib/log';
import { RateLimits, chargeRateLimit } from '@/lib/rate-limit';
import { MagicLinkRateLimited, consumeMagicLinkRateLimits } from './magic-link-rate-limit';

const db = {} as Db;
const email = 'pat@example.com';
const ip = '203.0.113.7';
const charge = vi.mocked(chargeRateLimit);

let logWarn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  charge.mockReset();
  charge.mockResolvedValue(null);
  logWarn = vi.spyOn(log, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('consumeMagicLinkRateLimits', () => {
  it('charges the IP, then the address', async () => {
    await consumeMagicLinkRateLimits(db, { email, ip });
    expect(charge.mock.calls).toEqual([
      [db, RateLimits.magicLinkPerIp, ip],
      [db, RateLimits.magicLinkPerEmail, email],
    ]);
    expect(logWarn).not.toHaveBeenCalled();
  });

  it('charges a request with no IP to one shared bucket', async () => {
    await consumeMagicLinkRateLimits(db, { email, ip: null });
    expect(charge).toHaveBeenCalledWith(db, RateLimits.magicLinkPerIp, 'unknown');
  });

  it.each([
    ['the IP', RateLimits.magicLinkPerIp],
    ['the address', RateLimits.magicLinkPerEmail],
  ])('throws MagicLinkRateLimited, and warns, when %s is over its limit', async (_, policy) => {
    charge.mockImplementation(async (_db, p) => (p === policy ? 600 : null));
    const thrown = await consumeMagicLinkRateLimits(db, { email, ip }).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(MagicLinkRateLimited);
    expect((thrown as MagicLinkRateLimited).cause).toEqual({ bucket: policy.bucket, retryAfterSeconds: 600 });
    expect(logWarn).toHaveBeenCalledWith(
      { emailDomain: 'example.com', bucket: policy.bucket },
      'magic link rate-limited',
    );
  });

  it('leaves the address uncharged when the IP is over its limit', async () => {
    charge.mockImplementation(async (_db, p) => (p === RateLimits.magicLinkPerIp ? 600 : null));
    await expect(consumeMagicLinkRateLimits(db, { email, ip })).rejects.toBeInstanceOf(MagicLinkRateLimited);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('lets any other failure through as it was', async () => {
    const down = new Error('connection refused');
    charge.mockRejectedValue(down);
    await expect(consumeMagicLinkRateLimits(db, { email, ip })).rejects.toBe(down);
    const internal = new ServiceException(serviceError('internal', 'rate limit check failed'));
    charge.mockRejectedValue(internal);
    await expect(consumeMagicLinkRateLimits(db, { email, ip })).rejects.toBe(internal);
    expect(logWarn).not.toHaveBeenCalled();
  });
});

// What Auth.js does with MagicLinkRateLimited (rethrows it to signIn, and
// answers the HTTP route as before) is pinned against the real next-auth in
// src/app/login/request-magic-link.test.ts.
