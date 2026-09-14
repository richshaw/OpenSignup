import type { Db } from '@/db/client';
import { serviceError, type ServiceError } from '@/lib/errors';
import type { Actor, WorkspaceRole } from '@/lib/policy';
import { err, ok, type Result } from '@/lib/result';
import type { Scope } from '@/oauth/scopes';

export type OrganizerActor = Extract<Actor, { kind: 'organizer' }>;

export interface ToolWorkspace {
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
export function resolveWorkspaceId(ctx: ToolContext, requested?: string): Result<string, ServiceError> {
  if (requested) return ok(requested);
  if (ctx.defaultWorkspaceId) return ok(ctx.defaultWorkspaceId);
  return err(
    serviceError('invalid_input', 'no workspace given and the account has no default workspace', {
      field: 'workspaceId',
      suggestion: 'call list_workspaces and pass one of the ids as workspaceId',
    }),
  );
}
