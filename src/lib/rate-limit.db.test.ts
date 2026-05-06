import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { rateLimits } from '@/db/schema/rate-limits';
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
