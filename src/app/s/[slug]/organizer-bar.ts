import { workspaceRole, type Actor } from '@/lib/policy';

/**
 * The signup's id when the actor is a member of its workspace, any role, so
 * the public page can show its organizer bar; null for anyone else. A signup
 * with no workspace belongs to nobody. The id goes only into that bar's
 * links: `toPublicSignup` keeps it out of what the page and the public API
 * hand to visitors.
 */
export function organizerBarSignupId(
  actor: Actor,
  signup: { id: string; workspaceId: string | null },
): string | null {
  if (signup.workspaceId === null) return null;
  return workspaceRole(actor, signup.workspaceId) ? signup.id : null;
}
