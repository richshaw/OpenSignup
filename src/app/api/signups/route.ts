import type { OrganizerSession } from '@/auth/organizer-session';
import { getOrganizerSession } from '@/auth/session';
import { newSignupLocale } from '@/i18n/organizer';
import type { SignupLocaleSource } from '@/i18n/organizer-locale';
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

export const POST = organizerRoute(async ({ req, db, actor }) => {
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

  // Policy first: a viewer's attempt must not cost a create-quota unit.
  requireWorkspaceWrite(actor, workspace.value);
  await consumeRateLimit(db, RateLimits.signupCreatePerOrganizer, actor.id);

  const { input, localeSource } = withLanguage(body, session, req.headers.get('accept-language'));
  const created = await createSignup(db, actor, workspace.value, input, { localeSource });
  return respond(created, (signup) => ({
    self: link(`/api/signups/${signup.id}`),
    publish: link(`/api/signups/${signup.id}/publish`, 'POST'),
    public: link(publicSignupUrl(signup.slug)),
  }));
});

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The body to create from, with the new signup's language in its settings.
 * A `settings.locale` the caller sent stays as sent (`createSignup` refuses
 * one that hasn't shipped), and its source is `api`. Without one, the
 * organizer's language goes in (`newSignupLocale`): none while only one
 * language has shipped. A body or `settings` that isn't an object is left as
 * it is, for `createSignup` to refuse.
 */
function withLanguage(
  body: unknown,
  session: Pick<OrganizerSession, 'locale'> | null,
  acceptLanguage: string | null,
): { input: unknown; localeSource?: SignupLocaleSource } {
  if (!isObject(body)) return { input: body };
  const { settings } = body;
  if (isObject(settings) && settings.locale !== undefined) {
    return { input: body, localeSource: 'api' };
  }
  if (settings !== undefined && !isObject(settings)) return { input: body };
  const chosen = newSignupLocale({ locale: session?.locale ?? null }, acceptLanguage);
  if (!chosen) return { input: body };
  return {
    input: { ...body, settings: { ...settings, locale: chosen.locale } },
    localeSource: chosen.source,
  };
}

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
