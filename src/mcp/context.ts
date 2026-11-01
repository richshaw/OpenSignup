import type { Db } from '@/db/client';
import type { ServiceError } from '@/lib/errors';
import type { Actor, WorkspaceRole } from '@/lib/policy';
import type { Result } from '@/lib/result';
import { chooseWorkspaceId } from '@/lib/workspace-choice';
import type { Scope } from '@/oauth/scopes';

type OrganizerActor = Extract<Actor, { kind: 'organizer' }>;

interface ToolWorkspace {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
}

/**
 * Everything a tool handler may know about the request. Built once per
 * request from the bearer seam's resolution; never shared across requests.
 */
export interface ToolContext {
  db: Db;
  actor: OrganizerActor;
  scopes: Scope[];
  clientId: string;
  defaultWorkspaceId: string | null;
  workspaces: ToolWorkspace[];
}

/** The workspace a tool acts in: the argument if given, else the organizer's default. */
export function resolveWorkspaceId(
  ctx: ToolContext,
  requested?: string,
): Result<string, ServiceError> {
  return chooseWorkspaceId(requested, ctx.defaultWorkspaceId, {
    invalid: 'omit workspaceId to use the default workspace, or pass an id from list_workspaces',
    noDefault: 'call list_workspaces and pass one of the ids as workspaceId',
  });
}
