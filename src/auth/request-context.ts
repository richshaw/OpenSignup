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
