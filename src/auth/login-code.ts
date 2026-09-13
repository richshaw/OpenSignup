import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Queryable } from '@/db/client';
import { magicLinks } from '@/db/schema/magic-links';
import { getEnv } from '@/lib/env';
import { serviceError } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import { err, ok, type Result } from '@/lib/result';
import type { ServiceError } from '@/lib/errors';

/**
 * A six-digit code that rides along in the magic-link email so a person who
 * opens the email somewhere else (their phone) can still finish signing in
 * where they started (the laptop window an AI client opened). Redeeming the
 * code does exactly what clicking the link does: it sends the browser to the
 * Auth.js callback URL, which is stored here encrypted because it carries
 * the single-use sign-in token.
 *
 * The code is stored as HMAC(secret, email:code), so a guess is only worth
 * anything for the email it was issued to, and the table never holds a
 * value that can be redeemed by reading it.
 */

export const LOGIN_CODE_LENGTH = 6;
const PURPOSE = 'login_code';

export function generateLoginCode(): string {
  return String(randomInt(0, 10 ** LOGIN_CODE_LENGTH)).padStart(LOGIN_CODE_LENGTH, '0');
}

/** Accepts "123456", "123 456", "123-456"; returns null for anything else. */
export function normalizeLoginCode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  return new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`).test(digits) ? digits : null;
}

export function hashLoginCode(email: string, code: string, secret = getEnv().AUTH_SECRET): string {
  return createHmac('sha256', secret).update(`${email.trim().toLowerCase()}:${code}`).digest('hex');
}

function encryptionKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'opensignup-login-code', 'callback-url', 32));
}

export function encryptCallbackUrl(url: string, secret = getEnv().AUTH_SECRET): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const body = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

export function decryptCallbackUrl(blob: string, secret = getEnv().AUTH_SECRET): string | null {
  try {
    const [iv, tag, body] = blob.split('.').map((p) => Buffer.from(p, 'base64url'));
    if (!iv || !tag || !body) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Mint a code for this email and remember the callback it redeems. Any
 * earlier unredeemed code for the same email is retired: only the latest
 * email's code works, which is also what a person expects.
 */
export async function issueLoginCode(
  db: Queryable,
  input: { email: string; callbackUrl: string; expiresAt: Date },
): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const code = generateLoginCode();
  await db
    .update(magicLinks)
    .set({ consumedAt: new Date() })
    .where(and(eq(magicLinks.email, email), eq(magicLinks.purpose, PURPOSE), isNull(magicLinks.consumedAt)));
  await db.insert(magicLinks).values({
    id: makeId('ml'),
    tokenHash: hashLoginCode(email, code),
    email,
    purpose: PURPOSE,
    scopeId: null,
    payloadEncrypted: encryptCallbackUrl(input.callbackUrl),
    expiresAt: input.expiresAt,
  });
  return code;
}

/**
 * Exchange a code for the callback URL it protects. Single use. The caller
 * must have consumed the attempt rate limits first; this function does no
 * metering of its own.
 */
export async function redeemLoginCode(
  db: Queryable,
  input: { email: string; code: string },
): Promise<Result<string, ServiceError>> {
  const email = input.email.trim().toLowerCase();
  const code = normalizeLoginCode(input.code);
  if (!code) return err(serviceError('invalid_input', 'enter the six-digit code from the email', { field: 'code' }));
  const [row] = await db
    .select()
    .from(magicLinks)
    .where(and(eq(magicLinks.tokenHash, hashLoginCode(email, code)), eq(magicLinks.purpose, PURPOSE)))
    .limit(1);
  if (!row || row.consumedAt) return err(serviceError('invalid_input', 'that code is not valid', { field: 'code' }));
  if (row.expiresAt.getTime() <= Date.now()) {
    return err(serviceError('already_consumed', 'that code has expired — request a new link'));
  }
  const claimed = await db
    .update(magicLinks)
    .set({ consumedAt: new Date() })
    .where(and(eq(magicLinks.id, row.id), isNull(magicLinks.consumedAt)))
    .returning({ id: magicLinks.id });
  if (claimed.length === 0) return err(serviceError('invalid_input', 'that code is not valid', { field: 'code' }));
  const url = row.payloadEncrypted ? decryptCallbackUrl(row.payloadEncrypted) : null;
  if (!url) return err(serviceError('internal', 'could not read the sign-in link for that code'));
  return ok(url);
}
