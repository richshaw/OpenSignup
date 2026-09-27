import { decodeJwt, decodeProtectedHeader } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { OAUTH_COOKIES, OAUTH_ROUTES, consentPath } from './config';
import { generatePrivateJwk } from './keys';
import { buildProvider, type ProviderDeps } from './provider';
import {
  codeFromRedirect,
  createDriver,
  exchangeCode,
  finishInteraction,
  interactionDetails,
  pkcePair,
  refresh,
  resume,
  startAuthorization,
  type Driver,
} from './testing/flow-driver';

const ISSUER = 'https://signup.example.org';
const RESOURCE = `${ISSUER}/api/mcp`;
const CLIENT = 'test-client';
const REDIRECT = 'http://localhost/callback';
const ORG = 'org_test1';

let d: Driver;
const grantsUsed: string[] = [];
const grantIndex = new Map<string, string>();

beforeAll(async () => {
  const jwk = await generatePrivateJwk();
  const deps: ProviderDeps = {
    issuer: ISSUER,
    resource: RESOURCE,
    jwks: { keys: [jwk] },
    cookieKeys: ['test-cookie-secret'],
    staticClients: [
      { client_id: CLIENT, client_name: 'Test', redirect_uris: [REDIRECT] },
      { client_id: 'web-client', client_name: 'Hosted', redirect_uris: ['https://hosted.example/cb'], application_type: 'web' },
    ],
    organizerExists: async (id) => id === ORG,
    findGrantId: async (a, c) => grantIndex.get(`${a}|${c}`),
    allowCimdFetch: async () => true,
    onGrantUsed: async (id) => {
      grantsUsed.push(id);
    },
  };
  d = createDriver(buildProvider(deps), ISSUER);
});

async function approve(uid: string, scopes: string[]): Promise<string> {
  const details = await interactionDetails(d, uid);
  const grant = new d.provider.Grant({ accountId: ORG, clientId: String(details.params.client_id) });
  grant.addOIDCScope(scopes.join(' '));
  grant.addResourceScope(RESOURCE, scopes.filter((s) => s !== 'offline_access').join(' '));
  const grantId = await grant.save();
  grantIndex.set(`${ORG}|${details.params.client_id}`, grantId);
  const r = await finishInteraction(d, uid, { login: { accountId: ORG }, consent: { grantId } });
  expect(r.status).toBe(303);
  return grantId;
}

describe('discovery', () => {
  it('serves RFC 8414 metadata at the root well-known path with renamed routes', async () => {
    const r = await d.get('/.well-known/oauth-authorization-server');
    expect(r.status).toBe(200);
    const meta = await r.json();
    expect(meta.issuer).toBe(ISSUER);
    expect(meta.authorization_endpoint).toBe(`${ISSUER}${OAUTH_ROUTES.authorization}`);
    expect(meta.token_endpoint).toBe(`${ISSUER}${OAUTH_ROUTES.token}`);
    expect(meta.jwks_uri).toBe(`${ISSUER}${OAUTH_ROUTES.jwks}`);
    expect(meta.revocation_endpoint).toBe(`${ISSUER}${OAUTH_ROUTES.revocation}`);
    expect(meta.code_challenge_methods_supported).toEqual(['S256']);
    expect(meta.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(meta.grant_types_supported).toEqual(expect.arrayContaining(['authorization_code', 'refresh_token']));
    expect(meta.client_id_metadata_document_supported).toBe(true);
    expect(meta.scopes_supported).toEqual(expect.arrayContaining(['signups:read', 'signups:write', 'commitments:read']));
    expect(meta.userinfo_endpoint).toBeUndefined();
    expect(meta.end_session_endpoint).toBeUndefined();
    expect(meta.registration_endpoint).toBeUndefined();
    expect(meta.dpop_signing_alg_values_supported).toBeUndefined();
  });

  it('serves the same document as openid-configuration', async () => {
    const r = await d.get('/.well-known/openid-configuration');
    expect(r.status).toBe(200);
    expect((await r.json()).issuer).toBe(ISSUER);
  });

  it('publishes only public key material', async () => {
    const r = await d.get(OAUTH_ROUTES.jwks);
    const { keys } = await r.json();
    expect(keys).toHaveLength(1);
    expect(keys[0].kty).toBe('EC');
    expect(keys[0].d).toBeUndefined();
  });
});

describe('authorization code flow', () => {
  it('rejects a request without PKCE', async () => {
    const q = new URLSearchParams({
      client_id: CLIENT,
      redirect_uri: REDIRECT,
      response_type: 'code',
      scope: 'signups:read',
    });
    const r = await d.get(`${OAUTH_ROUTES.authorization}?${q}`);
    expect(r.status).toBe(303);
    const loc = new URL(r.headers.get('location')!);
    expect(loc.searchParams.get('error')).toBe('invalid_request');
    expect(loc.searchParams.get('error_description')).toMatch(/PKCE/);
  });

  it('accepts an ephemeral loopback port for a native client', async () => {
    const { challenge } = pkcePair();
    const { uid, response } = await startAuthorization(d, {
      clientId: CLIENT,
      redirectUri: 'http://localhost:51234/callback',
      scope: 'signups:read',
      challenge,
    });
    expect(response.status).toBe(303);
    expect(uid).not.toBe('');
  });

  it('runs end to end: consent, code, audience-bound JWT, refresh rotation, replay rejection', async () => {
    const { verifier, challenge } = pkcePair();
    const scope = 'signups:read signups:write offline_access';
    const { uid, response } = await startAuthorization(d, {
      clientId: CLIENT,
      redirectUri: REDIRECT,
      scope,
      resource: RESOURCE,
      challenge,
      state: 'xyz',
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(consentPath(uid));
    const cookies = response.headers.getSetCookie();
    const interactionCookie = cookies.find((c) => c.startsWith(`${OAUTH_COOKIES.interaction}=`))!;
    expect(interactionCookie).toMatch(new RegExp(`path=${consentPath(uid)}`, 'i'));
    expect(interactionCookie).toMatch(/httponly/i);
    expect(interactionCookie).toMatch(/secure/i);
    expect(interactionCookie).toMatch(/samesite=lax/i);

    const details = await interactionDetails(d, uid);
    expect(details.params.client_id).toBe(CLIENT);
    // `offline_access` is dropped from the request unless prompt=consent
    // (OIDC Core §11); refresh tokens are issued regardless (issueRefreshToken).
    expect(details.params.scope).toBe('signups:read signups:write');
    expect(details.prompt.name).toBe('login');

    const grantId = await approve(uid, scope.split(' '));

    const done = await resume(d, uid);
    expect(done.status).toBe(303);
    const { code, iss, state } = codeFromRedirect(done);
    expect(code).not.toBe('');
    expect(iss).toBe(ISSUER); // RFC 9207
    expect(state).toBe('xyz');
    expect(done.headers.get('location')!.startsWith(REDIRECT)).toBe(true);
    // The provider session cookie is scoped to the OAuth endpoints only.
    const sessionCookie = done.headers.getSetCookie().find((c) => c.startsWith(`${OAUTH_COOKIES.session}=`));
    expect(sessionCookie).toMatch(/path=\/api\/oauth/i);

    const tokenRes = await exchangeCode(d, { clientId: CLIENT, redirectUri: REDIRECT, code, verifier, resource: RESOURCE });
    expect(tokenRes.status).toBe(200);
    const tokens = await tokenRes.json();
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBe(15 * 60);
    expect(tokens.id_token).toBeUndefined();
    expect(tokens.refresh_token).toBeTruthy();
    const header = decodeProtectedHeader(tokens.access_token);
    expect(header.alg).toBe('ES256');
    expect(header.typ).toBe('at+jwt');
    const claims = decodeJwt(tokens.access_token);
    expect(claims.iss).toBe(ISSUER);
    expect(claims.aud).toBe(RESOURCE);
    expect(claims.sub).toBe(ORG);
    expect(claims.client_id).toBe(CLIENT);
    expect(claims.scope).toBe('signups:read signups:write');
    expect(grantsUsed).toContain(grantId);

    // Refresh without naming the resource reuses the granted one.
    const r1 = await refresh(d, { clientId: CLIENT, refreshToken: tokens.refresh_token });
    expect(r1.status, await r1.clone().text()).toBe(200);
    const t1 = await r1.json();
    expect(t1.refresh_token).not.toBe(tokens.refresh_token);
    expect(decodeJwt(t1.access_token).aud).toBe(RESOURCE);
    expect(decodeJwt(t1.access_token).scope).toBe('signups:read signups:write');

    // A refresh cannot widen scope.
    const widen = await refresh(d, { clientId: CLIENT, refreshToken: t1.refresh_token, scope: 'signups:read signups:write commitments:read' });
    expect(widen.status).toBe(400);
    expect((await widen.json()).error).toBe('invalid_scope');

    // Replaying the rotated-away token is rejected and kills the current one.
    const replay = await refresh(d, { clientId: CLIENT, refreshToken: tokens.refresh_token });
    expect(replay.status).toBe(400);
    expect((await replay.json()).error).toBe('invalid_grant');
    const dead = await refresh(d, { clientId: CLIENT, refreshToken: t1.refresh_token });
    expect(dead.status).toBe(400);
  });

  it('a replayed authorization code revokes every token issued from it', async () => {
    const { verifier, challenge } = pkcePair();
    const { uid } = await startAuthorization(d, { clientId: CLIENT, redirectUri: REDIRECT, scope: 'signups:read', challenge });
    await approve(uid, ['signups:read']);
    const { code } = codeFromRedirect(await resume(d, uid));
    const first = await exchangeCode(d, { clientId: CLIENT, redirectUri: REDIRECT, code, verifier });
    expect(first.status).toBe(200);
    const tokens = await first.json();
    const again = await exchangeCode(d, { clientId: CLIENT, redirectUri: REDIRECT, code, verifier });
    expect(again.status).toBe(400);
    expect((await again.json()).error).toBe('invalid_grant');
    // RFC 6749 §4.1.2: the refresh token minted from the leaked code is dead too.
    const r = await refresh(d, { clientId: CLIENT, refreshToken: tokens.refresh_token });
    expect(r.status).toBe(400);
  });

  it('refuses to bind a token to a resource other than the MCP endpoint', async () => {
    const { verifier, challenge } = pkcePair();
    const { uid } = await startAuthorization(d, {
      clientId: CLIENT,
      redirectUri: REDIRECT,
      scope: 'signups:read',
      challenge,
    });
    await approve(uid, ['signups:read']);
    const { code } = codeFromRedirect(await resume(d, uid));
    const r = await exchangeCode(d, {
      clientId: CLIENT,
      redirectUri: REDIRECT,
      code,
      verifier,
      resource: `${ISSUER}/api/other`,
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('invalid_target');
  });

  it('a request naming a foreign resource is rejected at the authorization endpoint', async () => {
    const { challenge } = pkcePair();
    const { response } = await startAuthorization(d, {
      clientId: CLIENT,
      redirectUri: REDIRECT,
      scope: 'signups:read',
      resource: 'https://other.example/api',
      challenge,
    });
    const loc = new URL(response.headers.get('location')!);
    expect(loc.searchParams.get('error')).toBe('invalid_target');
  });

  it('a denied consent returns access_denied to the client, with no code', async () => {
    const { challenge } = pkcePair();
    const { uid } = await startAuthorization(d, { clientId: CLIENT, redirectUri: REDIRECT, scope: 'signups:read', challenge });
    await finishInteraction(d, uid, { error: 'access_denied', error_description: 'The organizer declined' });
    const done = await resume(d, uid);
    const loc = new URL(done.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe(REDIRECT);
    expect(loc.searchParams.get('error')).toBe('access_denied');
    expect(loc.searchParams.get('code')).toBeNull();
  });

  it('renders a plain HTML error page for a browser when the client is unknown', async () => {
    const q = new URLSearchParams({ client_id: 'nope', redirect_uri: REDIRECT, response_type: 'code', scope: 'x' });
    const r = await d.get(`${OAUTH_ROUTES.authorization}?${q}`, { accept: 'text/html' });
    expect(r.status).toBe(400);
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
    const html = await r.text();
    expect(html).toContain('could not be completed');
    expect(html).toContain('invalid_client');
  });

  it('rejects an unregistered redirect uri', async () => {
    const { challenge } = pkcePair();
    const q = new URLSearchParams({
      client_id: CLIENT,
      redirect_uri: 'https://evil.example/cb',
      response_type: 'code',
      scope: 'signups:read',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const r = await d.get(`${OAUTH_ROUTES.authorization}?${q}`, { accept: 'text/html' });
    // Cannot be sent back to an unverified redirect target, so it is rendered
    // to the person in the browser instead — never redirected.
    expect(r.status).toBe(400);
    expect(r.headers.get('location')).toBeNull();
    expect(await r.text()).toContain('invalid_redirect_uri');
  });
});

describe('consent is never skipped', () => {
  it('prompts a web client again even with a live provider session and an existing grant', async () => {
    const { verifier, challenge } = pkcePair();
    const first = await startAuthorization(d, { clientId: 'web-client', redirectUri: 'https://hosted.example/cb', scope: 'signups:read', challenge });
    await approve(first.uid, ['signups:read']);
    const { code } = codeFromRedirect(await resume(d, first.uid));
    expect((await exchangeCode(d, { clientId: 'web-client', redirectUri: 'https://hosted.example/cb', code, verifier })).status).toBe(200);
    // Same browser (same cookie jar → provider session), same client, same scopes.
    const second = await startAuthorization(d, { clientId: 'web-client', redirectUri: 'https://hosted.example/cb', scope: 'signups:read', challenge: pkcePair().challenge });
    expect(second.response.status).toBe(303);
    expect(second.response.headers.get('location')).toBe(consentPath(second.uid));
    const details = await interactionDetails(d, second.uid);
    expect(details.prompt.name).toBe('consent');
  });
});

