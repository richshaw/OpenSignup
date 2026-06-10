import type { BrowserContext } from '@playwright/test';
import { BASE_URL, loadSeed } from './fixtures';

/**
 * Authenticates as the seeded organizer by installing the Auth.js database
 * session cookie directly (session strategy is 'database', so the cookie
 * value is just the sessions.session_token row seeded in global-setup).
 */
export async function loginAsSeededOrganizer(context: BrowserContext): Promise<void> {
  const seed = loadSeed();
  // Auth.js derives useSecureCookies from the app URL scheme: over https the
  // cookie is renamed `__Secure-authjs.session-token` and must be `secure`.
  const secure = BASE_URL.startsWith('https://');
  await context.addCookies([
    {
      name: secure ? '__Secure-authjs.session-token' : 'authjs.session-token',
      value: seed.sessionToken,
      url: BASE_URL,
      httpOnly: true,
      secure,
      sameSite: 'Lax',
    },
  ]);
}
