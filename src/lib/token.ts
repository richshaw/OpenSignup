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

/**
 * What a sign-up's idempotency key is stored and looked up as:
 * HMAC(secret, [key, request]). With the request in it, a key finds an
 * earlier sign-up only when sent with the same details, so a client that
 * picks a guessable key hands no one else's edit link to a stranger. With the
 * secret, a copy of the database can't be checked against guessed keys.
 */
export function idempotencyKeyHash(key: string, request: unknown): string {
  return createHmac('sha256', secret())
    .update(JSON.stringify([key, request]))
    .digest('hex');
}
