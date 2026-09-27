import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '@/db/client';
import type { Actor } from '@/lib/policy';
import { ORGANIZER_CALLBACK_HEADER, safeCallbackUrl } from './callback-url';
import { auth } from './config';
import { loadOrganizerSessionById, toActor, type OrganizerSession } from './organizer-session';

export { loadOrganizerSessionById, toActor, type OrganizerSession };

export const getOrganizerSession = cache(async (): Promise<OrganizerSession | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return loadOrganizerSessionById(getDb(), session.user.id);
});

export async function requireActor(): Promise<Actor> {
  const session = await getOrganizerSession();
  return toActor(session);
}

/**
 * The organizer session, or a redirect to sign-in that comes back to the page
 * that was asked for (`src/middleware.ts` puts its path and query in
 * `ORGANIZER_CALLBACK_HEADER`). Every organizer page and server action calls
 * this itself: a client-side navigation re-renders only the segments that
 * changed, so the `(chrome)` layout's check does not run again when a session
 * ends mid-visit.
 */
export async function requireOrganizerSession(): Promise<OrganizerSession> {
  const session = await getOrganizerSession();
  if (!session) {
    const callbackUrl = safeCallbackUrl((await headers()).get(ORGANIZER_CALLBACK_HEADER));
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  return session;
}
