import { z } from 'zod';
import type { Db } from '@/db/client';
import { activityActor, recordActivityBestEffort } from '@/lib/activity';
import { serviceError, type ServiceError } from '@/lib/errors';
import { parseInputSafe } from '@/lib/parse';
import { requireWorkspaceAccess, type Actor } from '@/lib/policy';
import { err, ok, type Result } from '@/lib/result';
import { SIGNUP_LINK_COPY_SURFACES, SIGNUP_LINK_SHARE_SURFACES } from '@/lib/signup-link-events';
import { readLiveSignup } from './locks';

// Each event names only the surfaces it can come from: a copy never comes
// from the share menu, and a share never from the header.
const SignupLinkEventInputSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('copied'), surface: z.enum(SIGNUP_LINK_COPY_SURFACES) }),
  z.object({ event: z.literal('shared'), surface: z.enum(SIGNUP_LINK_SHARE_SURFACES) }),
]);

const EVENT_TYPES = {
  copied: 'signup.link_copied',
  shared: 'signup.link_shared',
} as const;

/**
 * Records that an organizer copied or shared a signup's public link. Anyone
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
