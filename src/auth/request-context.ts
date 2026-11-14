import { isIP } from 'node:net';
import { headers } from 'next/headers';

export function extractClientIp(h: Headers): string | null {
  const raw = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || null;
  return raw && isIP(raw) ? raw : null;
}

/**
 * Read the IP of the current Next.js request. Works inside server
 * actions, route handlers, and RSCs — anywhere `next/headers` is valid.
 * Returns null when called outside any request scope (e.g. background
 * jobs) so callers can fall back to a shared bucket.
 */
export async function getCurrentRequestIp(): Promise<string | null> {
  try {
    return extractClientIp(await headers());
  } catch {
    return null;
  }
}

/**
 * Read the current Next.js request's `Accept-Language` header, as sent, or
 * null when it has none or there is no request (outside any request scope),
 * as `getCurrentRequestIp` does. Account creation reads it once, to store the
 * new organizer's language (`newOrganizerLocale`): Auth.js creates the account
 * in the callback request, which the browser that signs in makes itself,
 * whether from the magic link, the six-digit code or a sign-in provider such
 * as Google.
 */
export async function getCurrentRequestAcceptLanguage(): Promise<string | null> {
  try {
    return (await headers()).get('accept-language');
  } catch {
    return null;
  }
}
