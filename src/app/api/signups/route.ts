import { getOrganizerSession } from '@/auth/session';
import { fail, readJson, respond } from '@/lib/api-response';
import { link, publicSignupUrl } from '@/lib/links';
import { organizerRoute } from '@/lib/organizer-route';
import { createSignup, listSignupsForWorkspace } from '@/services/signups';
import { SIGNUP_STATUSES } from '@/schemas/signups';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { chooseWorkspaceId } from '@/lib/workspace-choice';

const WORKSPACE_HINTS = {
  invalid:
    'omit workspaceId to use your default workspace, or pass the id of a workspace you belong to',
  noDefault: 'pass the id of a workspace you belong to as workspaceId',
};

export const POST = organizerRoute(async ({ req, db, actor }) => {
  await consumeRateLimit(db, RateLimits.signupCreatePerOrganizer, actor.id);

  const body = await readJson(req);
  const session = await getOrganizerSession();
  const requested =
    body && typeof body === 'object' && 'workspaceId' in body ? body.workspaceId : undefined;
  const workspace = chooseWorkspaceId(
    requested,
    session?.defaultWorkspaceId ?? null,
    WORKSPACE_HINTS,
  );
  if (!workspace.ok) return fail(workspace.error);

  return respond(await createSignup(db, actor, workspace.value, body), (signup) => ({
    self: link(`/api/signups/${signup.id}`),
    publish: link(`/api/signups/${signup.id}/publish`, 'POST'),
    public: link(publicSignupUrl(signup.slug)),
  }));
});

export const GET = organizerRoute(async ({ req, db, actor }) => {
  const url = new URL(req.url);
  const session = await getOrganizerSession();
  const workspace = chooseWorkspaceId(
    url.searchParams.get('workspaceId'),
    session?.defaultWorkspaceId ?? null,
    WORKSPACE_HINTS,
  );
  if (!workspace.ok) return fail(workspace.error);

  const statusParam = url.searchParams.get('status');
  const filter: { status?: (typeof SIGNUP_STATUSES)[number] } = {};
  if (statusParam && (SIGNUP_STATUSES as readonly string[]).includes(statusParam)) {
    filter.status = statusParam as (typeof SIGNUP_STATUSES)[number];
  }

  return listSignupsForWorkspace(db, actor, workspace.value, filter);
});
