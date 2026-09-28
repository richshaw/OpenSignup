import { AuthError } from 'next-auth';
import type { Db } from '@/db/client';
import { ServiceException } from '@/lib/errors';
import { log } from '@/lib/log';
import { RateLimits, consumeRateLimit } from '@/lib/rate-limit';

/**
 * Thrown from `sendVerificationRequest` when a magic-link request is over a
 * rate limit, so the login form can say so rather than "Couldn't send".
 *
 * It has to be an `AuthError`: Auth.js turns anything else the send throws
 * into its error page, the same answer a mail server that is down gets, and
 * rethrows only an `AuthError`, and only to next-auth's server-side `signIn`
 * (the one `requestMagicLink` calls). Over HTTP, at
 * `POST /api/auth/signin/nodemailer`, it still answers with its error page:
 * `EmailSignInError` is not a type it passes on to the browser, so the page
 * gets `?error=Configuration`, as it did for the `ServiceException`. `kind` is
 * left at its default, `error`, so it is the same page, too.
 */
export class MagicLinkRateLimited extends AuthError {
  static type = 'EmailSignInError';

  constructor(err: ServiceException) {
    // `{ err }` is the cause shape Auth.js's logger prints.
    super('magic link rate-limited', { cause: { err } });
  }
}

/**
 * Charges one magic-link request to the requesting IP and to the address, and
 * throws `MagicLinkRateLimited` when either is over its limit.
 */
export async function consumeMagicLinkRateLimits(
  db: Db,
  { email, ip }: { email: string; ip: string | null },
): Promise<void> {
  try {
    // IP bucket first: a misbehaving IP exhausts its own quota
    // before it can degrade any victim's per-email quota. Null IPs
    // share an "unknown" bucket so deployments missing
    // x-forwarded-for / x-real-ip don't silently no-op.
    await consumeRateLimit(db, RateLimits.magicLinkPerIp, ip ?? 'unknown');
    await consumeRateLimit(db, RateLimits.magicLinkPerEmail, email);
  } catch (err) {
    if (err instanceof ServiceException && err.serviceError.code === 'rate_limited') {
      log.warn({ email, ip, bucket: err.serviceError.details?.bucket }, 'magic link rate-limited');
      throw new MagicLinkRateLimited(err);
    }
    throw err;
  }
}
