import { lt } from 'drizzle-orm';
import type { Queryable } from '@/db/client';
import { verificationTokens } from '@/db/schema/auth';

/**
 * Deletes Auth.js sign-in tokens that have expired. The adapter removes a
 * token only when its link is used, and anyone can ask for a link to any
 * address, so without this every unclicked link would keep that address in
 * the table forever. An expired token can't sign anyone in, so nothing reads
 * these rows again.
 */
export async function sweepExpiredVerificationTokens(db: Queryable): Promise<number> {
  const rows = await db
    .delete(verificationTokens)
    .where(lt(verificationTokens.expires, new Date()))
    .returning({ token: verificationTokens.token });
  return rows.length;
}
