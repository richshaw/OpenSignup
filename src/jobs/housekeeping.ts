import { sweepExpiredLoginCodes } from '@/auth/login-code';
import { sweepExpiredVerificationTokens } from '@/auth/verification-tokens';
import { getDb } from '@/db/client';
import { log } from '@/lib/log';
import { sweepExpiredRateLimits } from '@/lib/rate-limit';
import { sweepExpiredOauthRecords } from '@/oauth/adapter';

/**
 * Deletes rows that can never be read again: expired OAuth records (codes,
 * refresh tokens, interactions, sessions), closed rate-limit windows, and
 * used or expired sign-in codes and tokens. All of them grow at an
 * attacker's pace — any client can start an authorization, any IP can hit a
 * metered endpoint, anyone can ask for a sign-in link to any address — so
 * this is what keeps them bounded.
 */
export async function runHousekeeping(): Promise<{
  oauthRecords: number;
  rateLimits: number;
  loginCodes: number;
  verificationTokens: number;
}> {
  const db = getDb();
  const oauthRecords = await sweepExpiredOauthRecords(db);
  const rateLimits = await sweepExpiredRateLimits(db);
  const loginCodes = await sweepExpiredLoginCodes(db);
  const verificationTokens = await sweepExpiredVerificationTokens(db);
  log.info(
    { oauthRecords, rateLimits, loginCodes, verificationTokens },
    'housekeeping: swept expired rows',
  );
  return { oauthRecords, rateLimits, loginCodes, verificationTokens };
}
