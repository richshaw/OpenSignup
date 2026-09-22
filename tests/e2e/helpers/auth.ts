import type { BrowserContext } from '@playwright/test';
import { BASE_URL, loadSeed } from './fixtures';

/**
 * Authenticates as the seeded organizer by installing the Auth.js database
 * session cookie directly (session strategy is 'database', so the cookie
 * value is just the sessions.session_token row seeded in global-setup).
 */
export async function loginAsSeededOrganizer(
  context: BrowserContext,
  opts: { sessionToken?: string } = {},
): Promise<void> {
  const seed = loadSeed();
  // Auth.js derives useSecureCookies from the app URL scheme: over https the
  // cookie is renamed `__Secure-authjs.session-token` and must be `secure`.
  const secure = BASE_URL.startsWith('https://');
  await context.addCookies([
    {
      name: secure ? '__Secure-authjs.session-token' : 'authjs.session-token',
      // A test that signs out deletes its session row; it passes its own
      // token (see createDisposableSession) rather than spending the shared one.
      value: opts.sessionToken ?? seed.sessionToken,
      url: BASE_URL,
      httpOnly: true,
      secure,
      sameSite: 'Lax',
    },
  ]);
}
