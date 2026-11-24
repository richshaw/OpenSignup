import { fail, readJson, respond } from '@/lib/api-response';
import { link, publicSignupUrl } from '@/lib/links';
import { organizerRoute } from '@/lib/organizer-route';
import { requireWorkspaceWrite } from '@/lib/policy';
import { createSignup, listSignupsForWorkspace } from '@/services/signups';
import { SIGNUP_STATUSES } from '@/schemas/signups';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { chooseWorkspaceId } from '@/lib/workspace-choice';

const WORKSPACE_HINTS = {
  invalid:
    'omit workspaceId to use your default workspace, or pass the id of a workspace you belong to',
  noDefault: 'pass the id of a workspace you belong to as workspaceId',
};

export const POST = organizerRoute(async ({ req, db, actor, session }) => {
  const body = await readJson(req);
  const requested =
    body && typeof body === 'object' && 'workspaceId' in body ? body.workspaceId : undefined;
  const workspace = chooseWorkspaceId(requested, session.defaultWorkspaceId, WORKSPACE_HINTS);
  if (!workspace.ok) return fail(workspace.error);

  // Policy first: a viewer's attempt must not cost a create-quota unit.
  requireWorkspaceWrite(actor, workspace.value);
  await consumeRateLimit(db, RateLimits.signupCreatePerOrganizer, actor.id);

  // A language the caller sent is kept (source `api`); without one, the
  // signup starts in the organizer's language for new signups.
  const created = await createSignup(db, actor, workspace.value, body, {
    organizer: { locale: session.locale },
  });
  return respond(created, (signup) => ({
    self: link(`/api/signups/${signup.id}`),
    publish: link(`/api/signups/${signup.id}/publish`, 'POST'),
    public: link(publicSignupUrl(signup.slug)),
  }));
});

export const GET = organizerRoute(async ({ req, db, actor, session }) => {
  const url = new URL(req.url);
  const workspace = chooseWorkspaceId(
    url.searchParams.get('workspaceId'),
    session.defaultWorkspaceId,
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
