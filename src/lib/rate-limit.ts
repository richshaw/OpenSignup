import { and, eq, gte, sql } from 'drizzle-orm';
import { rateLimits } from '@/db/schema/idempotency';
import type { Db } from '@/db/client';
import { serviceError, ServiceException } from './errors';

export interface RateLimitPolicy {
  bucket: string;
  max: number;
  windowSeconds: number;
}

/**
 * Sliding-ish fixed-window rate limit backed by Postgres.
 * Cheap and sufficient for v1. For per-IP hot paths we rely on HTTP
 * edge/CDN layer in production as well.
 */
export async function consumeRateLimit(
  db: Db,
  policy: RateLimitPolicy,
  subject: string,
): Promise<void> {
  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / (policy.windowSeconds * 1000)) * (policy.windowSeconds * 1000),
  );

  const existing = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(
      and(
        eq(rateLimits.bucket, policy.bucket),
        eq(rateLimits.subject, subject),
        gte(rateLimits.windowStart, windowStart),
      ),
    )
    .limit(1);

  const currentCount = existing[0]?.count ?? 0;
  if (currentCount >= policy.max) {
    const retryAfter = Math.ceil(
      (windowStart.getTime() + policy.windowSeconds * 1000 - now.getTime()) / 1000,
    );
    throw new ServiceException(
      serviceError('rate_limited', 'too many requests', {
        details: { retryAfterSeconds: retryAfter, bucket: policy.bucket },
        suggestion: `wait ${retryAfter}s and retry`,
      }),
    );
  }

  await db
    .insert(rateLimits)
    .values({
      bucket: policy.bucket,
      subject,
      windowStart,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.subject, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    });
}

export const RateLimits = {
  magicLinkPerEmail: { bucket: 'auth.magic.email', max: 5, windowSeconds: 3600 },
  magicLinkPerIp: { bucket: 'auth.magic.ip', max: 20, windowSeconds: 3600 },
  commitmentPerIp: { bucket: 'commit.ip', max: 10, windowSeconds: 60 },
  signupCreatePerOrganizer: { bucket: 'signup.create', max: 60, windowSeconds: 3600 },
} as const;
