import { getOrganizerSession } from '@/auth/session';
import { fail, readJson, respond } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { link, publicSignupUrl } from '@/lib/links';
import { organizerRoute } from '@/lib/organizer-route';
import { createSignup, listSignupsForWorkspace } from '@/services/signups';
import { SIGNUP_STATUSES } from '@/schemas/signups';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';

export const POST = organizerRoute(async ({ req, db, actor }) => {
  await consumeRateLimit(db, RateLimits.signupCreatePerOrganizer, actor.id);

  const body = await readJson(req);
  const session = await getOrganizerSession();
  const workspaceId =
    (body && typeof body === 'object' && 'workspaceId' in body ? (body as { workspaceId: string }).workspaceId : null) ??
    session?.defaultWorkspaceId ??
    null;
  if (!workspaceId) return fail(serviceError('invalid_input', 'workspaceId required', { field: 'workspaceId' }));

  return respond(await createSignup(db, actor, workspaceId, body), (signup) => ({
    self: link(`/api/signups/${signup.id}`),
    publish: link(`/api/signups/${signup.id}/publish`, 'POST'),
    public: link(publicSignupUrl(signup.slug)),
  }));
});

export const GET = organizerRoute(async ({ req, db, actor }) => {
  const url = new URL(req.url);
  const session = await getOrganizerSession();
  const workspaceId = url.searchParams.get('workspaceId') ?? session?.defaultWorkspaceId;
  if (!workspaceId) return fail(serviceError('invalid_input', 'workspaceId required', { field: 'workspaceId' }));

  const statusParam = url.searchParams.get('status');
  const filter: { status?: (typeof SIGNUP_STATUSES)[number] } = {};
  if (statusParam && (SIGNUP_STATUSES as readonly string[]).includes(statusParam)) {
    filter.status = statusParam as (typeof SIGNUP_STATUSES)[number];
  }

  return listSignupsForWorkspace(db, actor, workspaceId, filter);
});
