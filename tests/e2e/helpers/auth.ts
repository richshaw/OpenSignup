import type { BrowserContext } from '@playwright/test';
import { BASE_URL, loadSeed } from './fixtures';

/**
 * Authenticates as the seeded organizer by installing the Auth.js database
 * session cookie directly (session strategy is 'database', so the cookie
 * value is just the sessions.session_token row seeded in global-setup).
 */
export async function loginAsSeededOrganizer(context: BrowserContext): Promise<void> {
  const seed = loadSeed();
  await context.addCookies([
    {
      name: 'authjs.session-token',
      value: seed.sessionToken,
      url: BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}
