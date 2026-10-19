import { serviceError, ServiceException } from './errors';

export type Actor =
  | {
      kind: 'organizer';
      id: string;
      email: string;
      workspaceIds: string[];
      /** Parallel to workspaceIds; each entry is the role in that workspace. */
      workspaceRoles: Record<string, WorkspaceRole>;
      /**
       * Set only when the actor arrived through a connected app's bearer
       * token (`src/auth/bearer.ts`). Names the app so the activity log can
       * say which app made a change. Never set by the cookie path, and
       * never read by the policy functions in this file.
       */
      via?: { clientId: string };
    }
  | {
      kind: 'participant';
      signupId: string;
      participantId: string;
      commitmentId: string;
    }
  | { kind: 'anonymous' };

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

const ROLE_CAN_WRITE: Record<WorkspaceRole, boolean> = {
  owner: true,
  admin: true,
  editor: true,
  viewer: false,
};

export function workspaceRole(actor: Actor, workspaceId: string): WorkspaceRole | null {
  if (actor.kind !== 'organizer') return null;
  return actor.workspaceRoles[workspaceId] ?? null;
}

export function requireOrganizer(actor: Actor): asserts actor is Extract<Actor, { kind: 'organizer' }> {
  if (actor.kind !== 'organizer') {
    throw new ServiceException(serviceError('unauthorized', 'sign in required'));
  }
}

export function requireOrganizerId(actor: Actor): string {
  requireOrganizer(actor);
  return actor.id;
}

/**
 * The actor's role in `workspaceId`, or a throw: `unauthorized` for anyone
 * who is not an organizer, `forbidden` for an organizer who is not a member.
 * A row with no workspace (the column is nullable) belongs to nobody, so it is
 * refused like any workspace the actor is not in, never let through.
 */
export function requireWorkspaceAccess(actor: Actor, workspaceId: string | null): WorkspaceRole {
  requireOrganizer(actor);
  const role = workspaceId === null ? null : workspaceRole(actor, workspaceId);
  if (!role) {
    throw new ServiceException(
      serviceError('forbidden', 'not a member of that workspace', {
        suggestion: 'switch to the correct workspace or ask an owner to invite you',
      }),
    );
  }
  return role;
}

export function requireWorkspaceWrite(actor: Actor, workspaceId: string | null): void {
  const role = requireWorkspaceAccess(actor, workspaceId);
  if (!ROLE_CAN_WRITE[role]) {
    throw new ServiceException(
      serviceError('forbidden', 'your role cannot modify this workspace', {
        suggestion: 'ask an owner or editor',
      }),
    );
  }
}
