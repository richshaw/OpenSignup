import { getDb } from '@/db/client';
import { log } from '@/lib/log';
import { sweepExpiredRateLimits } from '@/lib/rate-limit';
import { sweepExpiredOauthRecords } from '@/oauth/adapter';

/**
 * Deletes rows that can never be read again: expired OAuth records (codes,
 * refresh tokens, interactions, sessions) and closed rate-limit windows.
 * Both tables have attacker-influenced growth — any client can start an
 * authorization, any IP can hit a metered endpoint — so this is what keeps
 * them bounded.
 */
export async function runHousekeeping(): Promise<{ oauthRecords: number; rateLimits: number }> {
  const db = getDb();
  const oauthRecords = await sweepExpiredOauthRecords(db);
  const rateLimits = await sweepExpiredRateLimits(db);
  log.info({ oauthRecords, rateLimits }, 'housekeeping: swept expired rows');
  return { oauthRecords, rateLimits };
}
