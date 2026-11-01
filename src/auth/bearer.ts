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
import type { Actor, WorkspaceRole } from '@/lib/policy';
import {
  ACCESS_TOKEN_CLOCK_TOLERANCE,
  SIGNING_KEY_CACHE_MAX_AGE,
  mcpResourceUrl,
  oauthIssuer,
} from '@/oauth/config';
import { keyErrorSummary, loadOrCreateSigningKeys } from '@/oauth/keys';
import { protectedResourceMetadataUrl } from '@/oauth/resource-metadata';
import { parseScopeString, type Scope } from '@/oauth/scopes';
import { loadOrganizerSessionById, toActor, type OrganizerSession } from './organizer-session';

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
export interface BearerWorkspace {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
}

export type BearerResolution =
  | {
      ok: true;
      actor: Extract<Actor, { kind: 'organizer' }>;
      scopes: Scope[];
      clientId: string;
      /** The organizer's default workspace, for tools called without one. */
      defaultWorkspaceId: string | null;
      /** Every workspace the organizer belongs to, with names for display. */
      workspaces: BearerWorkspace[];
      /**
       * What the SDK verified, for handing back to SDK code that wants it
       * (the MCP handler's pass-through auth info). Carries the raw token;
       * never log it.
       */
      authInfo: AuthInfo;
    }
  | { ok: false; response: Response };

/** The organizer's memberships in the shape the MCP layer shows to a client. */
export function bearerWorkspaces(session: OrganizerSession): BearerWorkspace[] {
  return session.memberships.map((m) => ({
    id: m.workspaceId,
    slug: m.workspaceSlug,
    name: m.workspaceName,
    role: m.role,
  }));
}

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
  const actor = session ? toActor(session) : null;
  if (!session || actor?.kind !== 'organizer') {
    // The organizer behind the token is gone; treat the token as invalid.
    // `toActor` gives an organizer for every session, so the kind check only
    // narrows the type for the return below.
    return {
      ok: false,
      response: bearerAuthChallengeResponse(
        new OAuthError(OAuthErrorCode.InvalidToken, 'unknown account'),
        {
          resourceMetadataUrl,
        },
      ),
    };
  }
  return {
    ok: true,
    // Spread rather than mutate: `toActor` is React-cached and the object may be shared.
    actor: { ...actor, via: { clientId: auth.clientId } },
    scopes: parseScopeString(auth.scopes.join(' ')),
    clientId: auth.clientId,
    defaultWorkspaceId: session.defaultWorkspaceId,
    workspaces: bearerWorkspaces(session),
    authInfo: auth,
  };
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
 * another instance becomes visible here. It is also re-read once it is
 * `SIGNING_KEY_CACHE_MAX_AGE` old, which is how a retired key stops being
 * trusted: a token signed with it carries a `kid` we already know, so the
 * unknown-`kid` path alone would trust it until a restart. Keys are read from
 * the table, not from the copy the provider was built with, so a retired key
 * can't come back from there.
 */
export function createVerifier(opts: {
  issuer: string;
  resource: string;
  loadKeys?: () => Promise<JSONWebKeySet>;
}): OAuthTokenVerifier {
  const loadKeys =
    opts.loadKeys ?? (async () => ({ keys: (await loadOrCreateSigningKeys(getDb())).publicKeys }));
  type KeySet = ReturnType<typeof createLocalJWKSet>;
  let keySet: KeySet | null = null;
  let reading: Promise<KeySet> | null = null;
  let staleAt = 0;
  let lastReloadAt = 0;

  /**
   * One read at a time. Requests that need keys while a read runs share it,
   * so a cold start's burst sends one query, and an older read can't finish
   * after a newer one and bring back a key retired in between.
   */
  function readKeys(): Promise<KeySet> {
    reading ??= (async () => {
      try {
        const fresh = createLocalJWKSet(await loadKeys());
        keySet = fresh;
        staleAt = Date.now() + SIGNING_KEY_CACHE_MAX_AGE * 1000;
        return fresh;
      } finally {
        reading = null;
      }
    })();
    return reading;
  }

  /**
   * A forged token with a random `kid` must not be able to flush the key
   * cache on every request, so reloads are limited to one per interval; a
   * genuinely rotated key still shows up within that interval.
   */
  async function keys(force = false): Promise<KeySet> {
    const now = Date.now();
    if (!keySet) return readKeys();
    if (force && now - lastReloadAt >= RELOAD_INTERVAL_MS) {
      lastReloadAt = now;
      return readKeys();
    }
    if (now >= staleAt) {
      // Re-read in the background: the keys we hold verify this request as
      // well as they did the last one, so it shouldn't wait on the database.
      // A failed read keeps them too, and is tried again after the reload
      // interval rather than on every request.
      staleAt = now + RELOAD_INTERVAL_MS;
      readKeys().catch((err: unknown) =>
        log.warn(
          { reason: keyErrorSummary(err) },
          'oauth: signing keys re-read failed; keeping the cached set',
        ),
      );
    }
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
      // Not `err` itself: a failed key insert's message carries the private key.
      log.error({ reason: keyErrorSummary(err) }, 'oauth: signing keys unavailable');
      throw new OAuthError(OAuthErrorCode.ServerError, 'token verification unavailable');
    }
    try {
      const { payload } = await jwtVerify(token, keySetNow, {
        issuer: opts.issuer,
        audience: opts.resource,
        typ: 'at+jwt',
        requiredClaims: ['sub', 'exp', 'client_id'],
        clockTolerance: ACCESS_TOKEN_CLOCK_TOLERANCE,
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
      log.debug(
        { reason: err instanceof Error ? err.name : 'unknown' },
        'oauth: bearer token rejected',
      );
      // Any other failure — bad signature, wrong audience, expired — is one
      // error to the client. Raw jose errors must not escape: the SDK turns
      // anything that is not an OAuthError into a 500 with no challenge.
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'invalid access token');
    }
  }

  return { verifyAccessToken: (token) => verify(token, true) };
}
