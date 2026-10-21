import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { verificationTokens } from '@/db/schema/auth';
import { sweepExpiredVerificationTokens } from './verification-tokens';

const db = getDb();
const EMAIL = 'sweep-test@example.com';

afterEach(async () => {
  await db.delete(verificationTokens).where(eq(verificationTokens.identifier, EMAIL));
});

describe('sweepExpiredVerificationTokens', () => {
  it('deletes sign-in tokens that have expired and keeps the rest', async () => {
    await db.insert(verificationTokens).values([
      { identifier: EMAIL, token: 'expired-hash', expires: new Date(Date.now() - 1000) },
      { identifier: EMAIL, token: 'live-hash', expires: new Date(Date.now() + 60_000) },
    ]);
    expect(await sweepExpiredVerificationTokens(db)).toBeGreaterThanOrEqual(1);
    const left = await db
      .select({ token: verificationTokens.token })
      .from(verificationTokens)
      .where(eq(verificationTokens.identifier, EMAIL));
    expect(left).toEqual([{ token: 'live-hash' }]);
  });
});
