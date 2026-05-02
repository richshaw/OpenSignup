import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from './env';

function secret(): string {
  return getEnv().AUTH_SECRET;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyHash(token: string, storedHash: string): boolean {
  const given = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/**
 * Edit tokens are stable for a given commitment: token = HMAC(secret, commitment_id).
 * This lets the service layer reconstruct the hash without a stored value
 * when needed, while still storing the hash in the DB for revocation.
 */
export function editTokenFor(commitmentId: string, extraSecret?: string): string {
  const h = createHmac('sha256', secret());
  h.update(commitmentId);
  if (extraSecret) h.update(extraSecret);
  return h.digest('base64url');
}
