import type { BearerOrganizer } from '@/auth/bearer';
import type { Db } from '@/db/client';
import type { ServiceError } from '@/lib/errors';
import type { Result } from '@/lib/result';
import { chooseWorkspaceId } from '@/lib/workspace-choice';

/**
 * Everything a tool handler may know about the request. Built once per
 * request from the bearer seam's resolution; never shared across requests.
 */
export type ToolContext = BearerOrganizer & { db: Db };

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
