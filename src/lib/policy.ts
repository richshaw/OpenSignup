import { serviceError, ServiceException } from './errors';

export type Actor =
  | {
      kind: 'organizer';
      id: string;
      email: string;
      workspaceIds: string[];
      /** Parallel to workspaceIds; each entry is the role in that workspace. */
      workspaceRoles: Record<string, WorkspaceRole>;
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

export function isInWorkspace(actor: Actor, workspaceId: string): boolean {
  return workspaceRole(actor, workspaceId) !== null;
}

export function requireOrganizer(actor: Actor): asserts actor is Extract<Actor, { kind: 'organizer' }> {
  if (actor.kind !== 'organizer') {
    throw new ServiceException(serviceError('unauthorized', 'organizer session required'));
  }
}

export function requireOrganizerId(actor: Actor): string {
  requireOrganizer(actor);
  return actor.id;
}

export function requireWorkspaceAccess(actor: Actor, workspaceId: string | null): WorkspaceRole | null {
  if (workspaceId === null) return null; // guest-scope, only covered by ownership checks elsewhere
  requireOrganizer(actor);
  const role = workspaceRole(actor, workspaceId);
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
  if (role === null) return;
  if (!ROLE_CAN_WRITE[role]) {
    throw new ServiceException(
      serviceError('forbidden', 'your role cannot modify this workspace', {
        suggestion: 'ask an owner or editor',
      }),
    );
  }
}

export function anon(): Extract<Actor, { kind: 'anonymous' }> {
  return { kind: 'anonymous' };
}
