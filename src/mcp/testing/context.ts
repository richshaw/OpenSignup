import { bearerWorkspaces } from '@/auth/bearer';
import { loadOrganizerSessionById, toActor } from '@/auth/organizer-session';
import type { Db } from '@/db/client';
import type { Scope } from '@/oauth/scopes';
import type { ToolContext } from '../context';

/** Builds the context the route would build for this organizer, from the database. */
export async function contextForOrganizer(
  db: Db,
  organizerId: string,
  clientId = 'https://client.example/metadata.json',
  scopes: Scope[] = ['signups:read', 'signups:write'],
): Promise<ToolContext> {
  const session = await loadOrganizerSessionById(db, organizerId);
  if (!session) throw new Error(`no organizer ${organizerId}`);
  const actor = toActor(session);
  if (actor.kind !== 'organizer') throw new Error('not an organizer');
  return {
    db,
    actor: { ...actor, via: { clientId } },
    scopes,
    clientId,
    defaultWorkspaceId: session.defaultWorkspaceId,
    workspaces: bearerWorkspaces(session),
  };
}
