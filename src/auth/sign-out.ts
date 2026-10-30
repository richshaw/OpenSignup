import { cookies } from 'next/headers';
import { signOut } from '@/auth/config';
import { OAUTH_COOKIES, OAUTH_SESSION_COOKIE_PATH } from '@/oauth/config';

/**
 * Sign the organizer out and go to `redirectTo`. The OAuth authorization
 * server keeps its own record of who is signed in; drop it too so a later
 * "connect an app" on this browser starts from whoever signs in next, not
 * from this organizer. Call it from a server action.
 */
export async function signOutOrganizer(redirectTo: string): Promise<void> {
  const jar = await cookies();
  for (const name of [OAUTH_COOKIES.session, `${OAUTH_COOKIES.session}.sig`]) {
    jar.delete({ name, path: OAUTH_SESSION_COOKIE_PATH });
  }
  await signOut({ redirectTo });
}
