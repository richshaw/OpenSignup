import { and, eq } from 'drizzle-orm';
import { cache } from 'react';
import type { Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import type { Actor, WorkspaceRole } from '@/lib/policy';

/**
 * The database half of an organizer's identity, shared by the cookie path
 * (`./session.ts`, via Auth.js) and the bearer-token path (`./bearer.ts`).
 * Both hand an organizer id to `loadOrganizerSessionById` and both run the
 * result through `toActor`, so a token and a cookie for the same organizer
 * produce byte-identical actors — the property every workspace-scoping
 * guard in `src/lib/policy.ts` relies on. This module deliberately imports
 * nothing from Auth.js.
 */
export interface OrganizerSession {
  organizerId: string;
  email: string;
  name: string | null;
  defaultWorkspaceId: string | null;
  memberships: {
    workspaceId: string;
    workspaceSlug: string;
    workspaceName: string;
    role: WorkspaceRole;
  }[];
}

export async function loadOrganizerSessionById(
  db: Db,
  organizerId: string,
): Promise<OrganizerSession | null> {
  const rows = await db
    .select({
      orgId: organizers.id,
      orgEmail: organizers.email,
      orgName: organizers.name,
      orgDefaultWs: organizers.defaultWorkspaceId,
      wsId: workspaces.id,
      wsSlug: workspaces.slug,
      wsName: workspaces.name,
      memberRole: workspaceMembers.role,
    })
    .from(organizers)
    .leftJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.organizerId, organizers.id),
        eq(workspaceMembers.status, 'active'),
      ),
    )
    .leftJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(organizers.id, organizerId));

  const first = rows[0];
  if (!first) return null;

  const memberships = rows
    .filter((r) => r.wsId && r.memberRole)
    .map((r) => ({
      workspaceId: r.wsId!,
      workspaceSlug: r.wsSlug!,
      workspaceName: r.wsName!,
      role: r.memberRole as WorkspaceRole,
    }));

  return {
    organizerId: first.orgId,
    email: first.orgEmail,
    name: first.orgName,
    defaultWorkspaceId: first.orgDefaultWs,
    memberships,
  };
}

export const toActor = cache((session: OrganizerSession | null): Actor => {
  if (!session) return { kind: 'anonymous' };
  const workspaceIds = session.memberships.map((m) => m.workspaceId);
  const workspaceRoles = Object.fromEntries(session.memberships.map((m) => [m.workspaceId, m.role]));
  return {
    kind: 'organizer',
    id: session.organizerId,
    email: session.email,
    workspaceIds,
    workspaceRoles,
  };
});
