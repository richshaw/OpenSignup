import { z } from 'zod';
import type { Db } from '@/db/client';
import { activityActor, recordActivityBestEffort } from '@/lib/activity';
import { serviceError, type ServiceError } from '@/lib/errors';
import { parseInputSafe } from '@/lib/parse';
import { requireWorkspaceAccess, type Actor } from '@/lib/policy';
import { err, ok, type Result } from '@/lib/result';
import { SIGNUP_LINK_EVENTS, SIGNUP_LINK_SURFACES } from '@/lib/signup-link-events';
import { readLiveSignup } from './locks';

const SignupLinkEventInputSchema = z.object({
  event: z.enum(SIGNUP_LINK_EVENTS),
  surface: z.enum(SIGNUP_LINK_SURFACES),
});

const EVENT_TYPES = {
  copied: 'signup.link_copied',
} as const;

/**
 * Records that an organizer copied a signup's public link. Anyone
 * who can see the signup can copy its link, a viewer included, so this needs
 * read access, not write. Telemetry describing no change: written outside a
 * transaction, best effort. The status says whether the link worked yet (a
 * draft's link says the signup isn't ready).
 */
export async function recordSignupLinkEvent(
  db: Db,
  actor: Actor,
  signupId: string,
  rawInput: unknown,
): Promise<Result<null, ServiceError>> {
  const parsed = parseInputSafe(SignupLinkEventInputSchema, rawInput);
  if (!parsed.ok) return parsed;
  const found = await readLiveSignup(db, signupId);
  if (!found) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceAccess(actor, found.workspaceId);
  await recordActivityBestEffort(db, {
    signupId,
    workspaceId: found.workspaceId,
    actor: activityActor(actor),
    eventType: EVENT_TYPES[parsed.value.event],
    payload: { surface: parsed.value.surface, status: found.status },
  });
  return ok(null);
}
