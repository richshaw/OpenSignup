import { headers } from 'next/headers';
import Provider, { errors as oidcErrors } from 'oidc-provider';
import { getDb } from '@/db/client';
import { recordActivityBestEffort } from '@/lib/activity';
import { serviceError, ServiceException } from '@/lib/errors';
import { log } from '@/lib/log';
import { requireOrganizerId, type Actor } from '@/lib/policy';
import { describeClient, type ClientDisplay } from './client-display';
import { consentPath, mcpResourceUrl, oauthIssuer, PROVIDER_SCOPES } from './config';
import { ensureGrant } from './grants';
import { getProvider } from './instance';
import { withNodePair } from './node-shim';
import { describeScopes, parseScopeString, RESOURCE_SCOPES, type ScopeDescription } from './scopes';

/**
 * The consent step, between the provider's authorization endpoint and the
 * organizer. The provider parks the request as an Interaction, sets a cookie
 * scoped to `/oauth/consent/<uid>`, and sends the browser there. We show who
 * is asking and for what; on a decision we hand the provider a result and it
 * resumes the authorization.
 */

export interface ConsentContext {
  uid: string;
  client: ClientDisplay;
  /** Rows to render, sensitive scopes last. */
  permissions: ScopeDescription[];
}

/** The parked request is gone: expired, already decided, or another browser's. */
export class ConsentUnavailable extends Error {
  constructor() {
    super('consent expired');
  }
}

/** Build a Request carrying the browser's cookies, for the provider's cookie check. */
async function browserRequest(uid: string, suffix = '', method = 'GET'): Promise<Request> {
  const h = await headers();
  const cookie = h.get('cookie') ?? '';
  return new Request(`${oauthIssuer()}${consentPath(uid)}${suffix}`, { method, headers: { cookie } });
}

async function details(provider: Provider, request: Request) {
  try {
    const { value } = await withNodePair(request, { origin: oauthIssuer(), clientIp: null }, (req, res) =>
      provider.interactionDetails(req, res),
    );
    return value;
  } catch (err) {
    // Only "no such interaction for this browser" means the request is
    // gone (expired, already decided, or a different browser). Anything
    // else — a database outage, say — must surface as an error the person
    // can retry, not as a misleading "expired" page.
    if (err instanceof oidcErrors.SessionNotFound) {
      log.info({ reason: err.error_description }, 'oauth: interaction not found');
      throw new ConsentUnavailable();
    }
    throw err;
  }
}

/**
 * The parked authorization request behind `uid`, as this browser sees it,
 * with the client that made it and the scopes it asked for. Throws
 * `ConsentUnavailable` if the request is gone.
 */
async function openInteraction(uid: string, suffix?: string, method?: string) {
  const provider = await getProvider();
  const request = await browserRequest(uid, suffix, method);
  const interaction = await details(provider, request);
  const clientId = String(interaction.params.client_id ?? '');
  const client = await provider.Client.find(clientId).catch(() => undefined);
  const scope = String(interaction.params.scope ?? '');
  return {
    provider,
    request,
    clientId,
    client: describeClient(clientId, client?.clientName ?? null),
    scope,
    requestedScopes: parseScopeString(scope),
  };
}

/** What the consent page shows. Throws `ConsentUnavailable` if the request is gone. */
export async function loadConsentContext(uid: string): Promise<ConsentContext> {
  const { client, requestedScopes } = await openInteraction(uid);
  return {
    uid,
    client,
    permissions: describeScopes(requestedScopes),
  };
}

export type Decision = 'approve' | 'deny';

/**
 * Record the organizer's decision and produce the redirect that resumes the
 * authorization. Approving creates (or extends) the Grant for this
 * organizer + client; denying returns `access_denied` to the client.
 */
export async function decideConsent(uid: string, actor: Actor, decision: Decision): Promise<Response> {
  const organizerId = requireOrganizerId(actor);
  const db = getDb();
  const { provider, request, clientId, client: display, scope, requestedScopes: requested } = await openInteraction(
    uid,
    '/decision',
    'POST',
  );
  const resourceScopes = requested.filter((s) => (RESOURCE_SCOPES as readonly string[]).includes(s));

  let result: Record<string, unknown>;
  if (decision === 'deny') {
    result = { error: 'access_denied', error_description: 'The organizer declined the connection' };
    await recordActivityBestEffort(db, {
      actor: { actorId: organizerId, actorType: 'organizer' },
      eventType: 'oauth.consent_denied',
      payload: { clientDomain: display.domain, scopes: resourceScopes },
    });
  } else if (resourceScopes.length === 0) {
    result = { error: 'invalid_scope', error_description: 'No usable permission was requested' };
  } else {
    // The provider's consent policy checks OIDC-level and resource-level
    // scopes independently and must see every requested value in both, or
    // it bounces the browser back here forever. Any OIDC scope the request
    // named (offline_access, openid) is granted at that level; resource
    // scopes are the ones that actually reach a token.
    const oidcScopes = scope
      .split(/\s+/)
      .filter((s) => (PROVIDER_SCOPES as readonly string[]).includes(s) || s === 'openid');
    const { grantId, extended } = await ensureGrant(db, provider, {
      accountId: organizerId,
      clientId,
      clientName: display.name,
      resource: mcpResourceUrl(),
      oidcScopes,
      resourceScopes,
    });
    result = { login: { accountId: organizerId }, consent: { grantId } };
    await recordActivityBestEffort(db, {
      actor: { actorId: organizerId, actorType: 'organizer' },
      eventType: 'oauth.consent_granted',
      payload: { clientDomain: display.domain, scopes: resourceScopes, extended },
    });
  }

  const { response, ended } = await withNodePair(request, { origin: oauthIssuer(), clientIp: null }, (req, res) =>
    provider.interactionFinished(req, res, result, { mergeWithLastSubmission: false }),
  );
  if (!ended) throw new ServiceException(serviceError('internal', 'consent could not be recorded'));
  return response;
}
