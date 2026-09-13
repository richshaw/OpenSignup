import {
  OAuthError,
  OAuthErrorCode,
  bearerAuthChallengeResponse,
  requireBearerAuth,
  type AuthInfo,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server';
import { createLocalJWKSet, errors as joseErrors, jwtVerify, type JSONWebKeySet } from 'jose';
import { getDb } from '@/db/client';
import { log } from '@/lib/log';
import type { Actor } from '@/lib/policy';
import { mcpResourceUrl, oauthIssuer } from '@/oauth/config';
import { getSigningKeys, resetSigningKeysCache } from '@/oauth/instance';
import { protectedResourceMetadataUrl } from '@/oauth/resource-metadata';
import { parseScopeString, type Scope } from '@/oauth/scopes';
import { loadOrganizerSessionById, toActor } from './organizer-session';

/**
 * The seam between the authorization server and the MCP layer.
 *
 * This is the only thing the MCP routes and tool handlers may know about
 * authentication: give it the request, get back the same `Actor` a cookie
 * session would produce plus the token's scopes, or a ready-made 401/403
 * challenge to return as-is. Token format, keys, audience, issuer — all of
 * that stays behind this function, so swapping the authorization server is
 * a rewrite of one file.
 *
 * Scope checks sit *on top of* the policy layer, never instead of it: a
 * token with `signups:write` still cannot write to a workspace where the
 * organizer is a viewer, because the actor is the same one
 * `requireWorkspaceWrite` already judges.
 */
export type BearerResolution =
  | { ok: true; actor: Extract<Actor, { kind: 'organizer' }>; scopes: Scope[]; clientId: string }
  | { ok: false; response: Response };

export async function resolveBearerActor(
  request: Request,
  opts: { requiredScopes?: Scope[] } = {},
): Promise<BearerResolution> {
  const resourceMetadataUrl = protectedResourceMetadataUrl(mcpResourceUrl());
  const guard = requireBearerAuth({
    verifier: getVerifier(),
    requiredScopes: opts.requiredScopes,
    resourceMetadataUrl,
  });
  const auth = await guard(request);
  if (auth instanceof Response) return { ok: false, response: auth };

  const organizerId = typeof auth.extra?.sub === 'string' ? auth.extra.sub : null;
  const session = organizerId ? await loadOrganizerSessionById(getDb(), organizerId) : null;
  if (!session) {
    // The organizer behind the token is gone; treat the token as invalid.
    return {
      ok: false,
      response: bearerAuthChallengeResponse(
        new OAuthError(OAuthErrorCode.InvalidToken, 'unknown account'),
        { resourceMetadataUrl },
      ),
    };
  }
  const actor = toActor(session);
  if (actor.kind !== 'organizer') {
    return {
      ok: false,
      response: bearerAuthChallengeResponse(new OAuthError(OAuthErrorCode.InvalidToken, 'unknown account'), {
        resourceMetadataUrl,
      }),
    };
  }
  return { ok: true, actor, scopes: parseScopeString(auth.scopes.join(' ')), clientId: auth.clientId };
}

/**
 * A 403 `insufficient_scope` challenge naming the missing scope, for the
 * step-up path: a client holding `signups:*` that reaches for participant
 * data gets told exactly which scope to ask for.
 */
export function insufficientScopeResponse(required: Scope[]): Response {
  return bearerAuthChallengeResponse(
    new OAuthError(OAuthErrorCode.InsufficientScope, 'this action needs an additional permission'),
    { requiredScopes: required, resourceMetadataUrl: protectedResourceMetadataUrl(mcpResourceUrl()) },
  );
}

let verifier: OAuthTokenVerifier | null = null;
const RELOAD_INTERVAL_MS = 30_000;

function getVerifier(): OAuthTokenVerifier {
  if (!verifier) verifier = createVerifier({ issuer: oauthIssuer(), resource: mcpResourceUrl() });
  return verifier;
}

/**
 * Verifies JWT access tokens against our own signing keys, in process — no
 * HTTP round trip to our own JWKS endpoint. Issuer and audience are
 * non-negotiable: a token minted for any other resource is rejected. On an
 * unknown `kid` the key set is re-read once, which is how a key rotated by
 * another instance becomes visible here.
 */
export function createVerifier(opts: {
  issuer: string;
  resource: string;
  loadKeys?: () => Promise<JSONWebKeySet>;
  reload?: () => void;
}): OAuthTokenVerifier {
  const loadKeys =
    opts.loadKeys ?? (async () => ({ keys: (await getSigningKeys()).publicKeys }));
  const reload = opts.reload ?? resetSigningKeysCache;
  let keySet: ReturnType<typeof createLocalJWKSet> | null = null;
  let lastReloadAt = 0;

  /**
   * A forged token with a random `kid` must not be able to flush the key
   * cache on every request, so reloads are limited to one per interval; a
   * genuinely rotated key still shows up within that interval.
   */
  async function keys(force = false) {
    if (force && Date.now() - lastReloadAt >= RELOAD_INTERVAL_MS) {
      lastReloadAt = Date.now();
      reload();
      keySet = null;
    }
    if (!keySet) keySet = createLocalJWKSet(await loadKeys());
    return keySet;
  }

  async function verify(token: string, retry: boolean): Promise<AuthInfo> {
    // Loading keys is infrastructure, not the client's fault: a database
    // outage must surface as server_error (500), never as invalid_token,
    // or clients would discard perfectly good refresh tokens.
    let keySetNow: ReturnType<typeof createLocalJWKSet>;
    try {
      keySetNow = await keys(!retry);
    } catch (err) {
      log.error({ err }, 'oauth: signing keys unavailable');
      throw new OAuthError(OAuthErrorCode.ServerError, 'token verification unavailable');
    }
    try {
      const { payload } = await jwtVerify(token, keySetNow, {
        issuer: opts.issuer,
        audience: opts.resource,
        typ: 'at+jwt',
        requiredClaims: ['sub', 'exp', 'client_id'],
        clockTolerance: 15,
      });
      return {
        token,
        clientId: String(payload.client_id),
        scopes: typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [],
        // Required by requireBearerAuth; a missing value is a blanket 401.
        expiresAt: payload.exp,
        resource: new URL(opts.resource),
        extra: { sub: payload.sub },
      };
    } catch (err) {
      if (err instanceof joseErrors.JWKSNoMatchingKey && retry) {
        return verify(token, false);
      }
      log.debug({ reason: err instanceof Error ? err.name : 'unknown' }, 'oauth: bearer token rejected');
      // Any other failure — bad signature, wrong audience, expired — is one
      // error to the client. Raw jose errors must not escape: the SDK turns
      // anything that is not an OAuthError into a 500 with no challenge.
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'invalid access token');
    }
  }

  return { verifyAccessToken: (token) => verify(token, true) };
}
