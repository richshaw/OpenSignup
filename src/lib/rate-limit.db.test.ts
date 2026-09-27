import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { rateLimits } from '@/db/schema/idempotency';
import { ServiceException } from './errors';
import { RateLimits, consumeRateLimit } from './rate-limit';

const TEST_BUCKETS = [
  RateLimits.magicLinkPerEmail.bucket,
  RateLimits.magicLinkPerIp.bucket,
  RateLimits.commitmentPerIp.bucket,
];

async function clearBucket(bucket: string, subject: string) {
  const db = getDb();
  await db
    .delete(rateLimits)
    .where(and(eq(rateLimits.bucket, bucket), eq(rateLimits.subject, subject)));
}

describe('consumeRateLimit (db)', () => {
  afterEach(async () => {
    const db = getDb();
    for (const bucket of TEST_BUCKETS) {
      await db.delete(rateLimits).where(eq(rateLimits.bucket, bucket));
    }
  });

  it('allows up to magicLinkPerEmail.max calls and rejects the next one', async () => {
    const db = getDb();
    const subject = `rl-test-${Date.now()}@example.test`;
    await clearBucket(RateLimits.magicLinkPerEmail.bucket, subject);

    for (let i = 0; i < RateLimits.magicLinkPerEmail.max; i += 1) {
      await consumeRateLimit(db, RateLimits.magicLinkPerEmail, subject);
    }

    let caught: unknown;
    try {
      await consumeRateLimit(db, RateLimits.magicLinkPerEmail, subject);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ServiceException);
    expect((caught as ServiceException).serviceError.code).toBe('rate_limited');
    expect((caught as ServiceException).serviceError.details?.bucket).toBe(
      RateLimits.magicLinkPerEmail.bucket,
    );
  });

  it('keeps separate counts per subject', async () => {
    const db = getDb();
    const a = `a-${Date.now()}@example.test`;
    const b = `b-${Date.now()}@example.test`;

    for (let i = 0; i < RateLimits.magicLinkPerEmail.max; i += 1) {
      await consumeRateLimit(db, RateLimits.magicLinkPerEmail, a);
    }
    // Subject `b` is still under the limit and should not throw.
    await expect(
      consumeRateLimit(db, RateLimits.magicLinkPerEmail, b),
    ).resolves.toBeUndefined();
  });

  it('treats null-IP commitment traffic as a shared "unknown" bucket', async () => {
    const db = getDb();

    for (let i = 0; i < RateLimits.commitmentPerIp.max; i += 1) {
      await consumeRateLimit(db, RateLimits.commitmentPerIp, 'unknown');
    }

    await expect(
      consumeRateLimit(db, RateLimits.commitmentPerIp, 'unknown'),
    ).rejects.toMatchObject({
      serviceError: { code: 'rate_limited' },
    });
  });
});

describe('sweepExpiredRateLimits', () => {
  it('removes only windows that closed long ago', async () => {
    const { sweepExpiredRateLimits } = await import('./rate-limit');
    const { rateLimits } = await import('@/db/schema/idempotency');
    const { eq } = await import('drizzle-orm');
    const db = getDb();
    await db.insert(rateLimits).values([
      { bucket: 'sweep.test', subject: 'old', windowStart: new Date(Date.now() - 3 * 24 * 3600 * 1000), count: 1 },
      { bucket: 'sweep.test', subject: 'fresh', windowStart: new Date(), count: 1 },
    ]);
    await sweepExpiredRateLimits(db);
    const rows = await db.select({ subject: rateLimits.subject }).from(rateLimits).where(eq(rateLimits.bucket, 'sweep.test'));
    expect(rows.map((r) => r.subject)).toEqual(['fresh']);
    await db.delete(rateLimits).where(eq(rateLimits.bucket, 'sweep.test'));
  });
});
