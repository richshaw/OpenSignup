import { cache } from 'react';
import { getDb } from '@/db/client';
import type { Actor } from '@/lib/policy';
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
