import { cookies } from 'next/headers';
import { loginUrl } from '@/auth/callback-url';
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

/**
 * Switch organizers: plain `/login` would bounce a signed-in organizer
 * straight back to `/app`, so this one is signed out first and the next
 * sign-in returns to `callbackUrl`, which the caller supplies already safe.
 */
export async function switchOrganizer(callbackUrl: string): Promise<void> {
  await signOutOrganizer(loginUrl(callbackUrl));
}
