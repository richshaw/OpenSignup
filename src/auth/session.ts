import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { getDb } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import type { Actor, WorkspaceRole } from '@/lib/policy';
import { auth } from './config';

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

export const getOrganizerSession = cache(async (): Promise<OrganizerSession | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const db = getDb();

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
    .leftJoin(workspaceMembers, eq(workspaceMembers.organizerId, organizers.id))
    .leftJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(organizers.id, session.user.id));

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
});

export function toActor(session: OrganizerSession | null): Actor {
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
}

export async function requireActor(): Promise<Actor> {
  const session = await getOrganizerSession();
  return toActor(session);
}
