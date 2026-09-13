import { getEnv } from '@/lib/env';
import { ADVERTISED_SCOPES, ALL_SCOPES, RESOURCE_SCOPES } from './scopes';

/**
 * Everything the authorization server and the resource server both need to
 * agree on lives here, derived from `AUTH_URL` so a self-hosted instance at
 * any origin works untouched and discovery never advertises Fly's internal
 * hostname (the trap `src/auth/magic-link-url.ts` exists for).
 *
 * The issuer is the bare origin. The provider's routes are renamed to live
 * under `/api/oauth/*`, so RFC 8414 discovery sits at the root well-known
 * paths and there is no mount prefix to strip anywhere.
 */

/** Canonical public origin, e.g. `https://opensignup.org`. */
export function oauthIssuer(): string {
  return new URL(getEnv().AUTH_URL).origin;
}

/** Path of the MCP endpoint, relative to the origin. */
export const MCP_RESOURCE_PATH = '/api/mcp';

/** The single resource indicator (RFC 8707) every token is bound to. */
export function mcpResourceUrl(): string {
  return `${oauthIssuer()}${MCP_RESOURCE_PATH}`;
}

export const OAUTH_ROUTES = {
  authorization: '/api/oauth/authorize',
  token: '/api/oauth/token',
  jwks: '/api/oauth/jwks',
  revocation: '/api/oauth/revoke',
  pushed_authorization_request: '/api/oauth/par',
  // Unused features still need distinct paths or the router complains.
  introspection: '/api/oauth/introspect',
  userinfo: '/api/oauth/userinfo',
  registration: '/api/oauth/register',
  end_session: '/api/oauth/logout',
  device_authorization: '/api/oauth/device',
  code_verification: '/api/oauth/device/verify',
  backchannel_authentication: '/api/oauth/backchannel',
  challenge: '/api/oauth/challenge',
  nonce: '/api/oauth/nonce',
  credential: '/api/oauth/credential',
  deferred_credential: '/api/oauth/credential/deferred',
} as const;

/** Where the provider sends the browser to log in and consent. */
export const CONSENT_PATH_PREFIX = '/oauth/consent';
export function consentPath(uid: string): string {
  return `${CONSENT_PATH_PREFIX}/${uid}`;
}

/**
 * Cookie names. Prefixed so they are recognisably ours in the browser's
 * cookie list and on the cookies legal page.
 */
export const OAUTH_COOKIES = {
  session: 'os_oauth_session',
  interaction: 'os_oauth_interaction',
  resume: 'os_oauth_resume',
} as const;

/** Path the provider-session cookie is scoped to — only the OAuth endpoints. */
export const OAUTH_SESSION_COOKIE_PATH = '/api/oauth';

/**
 * Lifetimes, in seconds.
 *
 * Access tokens are JWTs verified without a database lookup, so nothing can
 * cut one short once issued: a disconnect only stops the *next* refresh. That
 * residual window is what `ACCESS_TOKEN` bounds, and it is what the connected
 * apps page tells the organizer. Refresh tokens rotate on every use and get a
 * fresh `REFRESH_TOKEN` window each time, but never past `GRANT_MAX` from the
 * original approval, after which the client must ask again.
 */
export const OAUTH_TTL = {
  ACCESS_TOKEN: 15 * 60,
  AUTHORIZATION_CODE: 60,
  REFRESH_TOKEN: 30 * 24 * 60 * 60,
  GRANT_MAX: 90 * 24 * 60 * 60,
  INTERACTION: 15 * 60,
  SESSION: 24 * 60 * 60,
} as const;

export const SIGNING_ALG = 'ES256';

export const RESOURCE_SCOPE_STRING = RESOURCE_SCOPES.join(' ');
export const PROVIDER_SCOPES = [...ALL_SCOPES];
export const ADVERTISED_SCOPE_LIST = [...ADVERTISED_SCOPES];
