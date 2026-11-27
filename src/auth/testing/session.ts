import type { Actor } from '@/lib/policy';
import type { OrganizerSession } from '../organizer-session';

/**
 * The organizer session `toActor` turns back into this actor, for a test that
 * mocks `getOrganizerSession` and wants to say who is signed in as an `Actor`.
 * Anyone but an organizer has no session.
 */
export function sessionOf(
  actor: Actor | undefined,
  extra: { defaultWorkspaceId?: string | null; locale?: string | null } = {},
): OrganizerSession | null {
  if (actor?.kind !== 'organizer') return null;
  return {
    organizerId: actor.id,
    email: actor.email,
    name: null,
    defaultWorkspaceId: extra.defaultWorkspaceId ?? null,
    locale: extra.locale ?? null,
    memberships: actor.workspaceIds.map((workspaceId) => {
      const role = actor.workspaceRoles[workspaceId];
      if (!role) throw new Error(`sessionOf: no role for ${workspaceId}`);
      return { workspaceId, workspaceSlug: workspaceId, workspaceName: workspaceId, role };
    }),
  };
}
