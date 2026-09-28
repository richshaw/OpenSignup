import { MagicLinkRateLimited } from '@/auth/magic-link-rate-limit';
import { log } from '@/lib/log';
import type { LoginActionResult } from './login-form';

type SignIn = (
  provider: 'nodemailer',
  options: { email: string; redirect: false; redirectTo: string },
) => Promise<unknown>;

/**
 * Asks Auth.js to email a magic link, and says whether it went.
 *
 * A resolved `signIn` does not mean the link was sent. When
 * `sendVerificationRequest` throws anything but an `AuthError` (a transport
 * failure, the send timeout), Auth.js logs it as `[auth][error]` and resolves
 * to its error page, which for us is `/login?error=Configuration`. When it
 * rejects its own config it resolves to the sign-in URL it was given. Only a
 * link that went out resolves to its verify-request page, so that is the one
 * answer read as sent. An `AuthError` is rethrown, and that is a failure too:
 * `rate_limited` when it is the rate limit's `MagicLinkRateLimited`, so the
 * form can say to wait rather than to try again.
 */
export async function requestMagicLink(
  signIn: SignIn,
  { email, callbackUrl }: { email: string; callbackUrl: string },
): Promise<LoginActionResult> {
  let resolved: unknown;
  try {
    resolved = await signIn('nodemailer', { email, redirect: false, redirectTo: callbackUrl });
  } catch (err) {
    // Logged as a warning where the limit was hit (src/auth/magic-link-rate-limit.ts).
    if (err instanceof MagicLinkRateLimited) return { ok: false, reason: 'rate_limited' };
    log.error({ err }, 'login: signIn failed');
    return { ok: false, reason: 'send_failed' };
  }
  const url = parseUrl(resolved);
  if (!url?.pathname.endsWith('/verify-request')) {
    // The path and the error type only, so nothing else from the query
    // (such as a callback URL) reaches the log.
    log.error(
      { authError: url?.searchParams.get('error') ?? null, path: url?.pathname ?? null },
      'login: signIn failed',
    );
    return { ok: false, reason: 'send_failed' };
  }
  return { ok: true, email };
}

function parseUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value, 'http://localhost');
  } catch {
    return null;
  }
}
