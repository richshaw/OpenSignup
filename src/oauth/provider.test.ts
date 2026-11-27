import { decodeJwt, decodeProtectedHeader } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import type { Translator } from '@/i18n/translator';
import { OAUTH_COOKIES, OAUTH_ROUTES, consentPath } from './config';
import { generatePrivateJwk } from './keys';
import { buildProvider, renderErrorPage, type ProviderDeps } from './provider';
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

// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`). `translator`, when
// a test sets it, answers instead, for the test of what the page escapes.
const text = vi.hoisted(() => ({ translator: null as unknown }));
vi.mock('@/i18n/server', async () => {
  const { getTestServerTranslator } = await import('@/i18n/testing/translator');
  return {
    instanceDefaultLocale: () => undefined,
    getServerTranslator: (locale: string, namespace: 'auth.oauthErrors') =>
      text.translator ?? getTestServerTranslator(locale, namespace),
  };
});

const ISSUER = 'https://signup.example.org';
const RESOURCE = `${ISSUER}/api/mcp`;
const CLIENT = 'test-client';
const REDIRECT = 'http://localhost/callback';
const ORG = 'org_test1';

/**
 * The fields of ChatGPT's CIMD document that matter here: it names
 * `private_key_jwt` but lists `none` among the methods it supports.
 */
const CHATGPT = 'https://chatgpt.com/oauth/client.json';
const CHATGPT_REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
const chatgptDocument = {
  client_id: CHATGPT,
  client_name: 'ChatGPT',
  redirect_uris: [CHATGPT_REDIRECT],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'private_key_jwt',
  token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
  token_endpoint_auth_signing_alg: 'RS256',
  jwks_uri: 'https://chatgpt.com/oauth/jwks.json',
};
/** The same document, from a client that can't act as a public client. */
const KEY_ONLY = 'https://keyonly.example/oauth/client.json';
const keyOnlyDocument = {
  ...chatgptDocument,
  client_id: KEY_ONLY,
  redirect_uris: ['https://keyonly.example/cb'],
  token_endpoint_auth_methods_supported: ['private_key_jwt'],
};
const cimdDocuments: Record<string, object> = {
  [CHATGPT]: chatgptDocument,
  [KEY_ONLY]: keyOnlyDocument,
};

let d: Driver;
let deps: ProviderDeps;
const grantsUsed: string[] = [];
const grantIndex = new Map<string, string>();

beforeAll(async () => {
  const jwk = await generatePrivateJwk();
  deps = {
    issuer: ISSUER,
    resource: RESOURCE,
    jwks: { keys: [jwk] },
    cookieKeys: ['test-cookie-secret'],
    staticClients: [
      { client_id: CLIENT, client_name: 'Test', redirect_uris: [REDIRECT] },
      {
        client_id: 'web-client',
        client_name: 'Hosted',
        redirect_uris: ['https://hosted.example/cb'],
        application_type: 'web',
      },
    ],
    organizerExists: async (id) => id === ORG,
    findGrantId: async (a, c) => grantIndex.get(`${a}|${c}`),
    allowCimdFetch: async () => true,
    onGrantUsed: async (id) => {
      grantsUsed.push(id);
    },
    errorPageLocale: 'en',
    fetch: async (url) => {
      const doc = cimdDocuments[String(url)];
      return doc
        ? new Response(JSON.stringify(doc), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response('not found', { status: 404 });
    },
  };
  d = createDriver(buildProvider(deps), ISSUER);
});

async function approve(uid: string, scopes: string[]): Promise<string> {
  const details = await interactionDetails(d, uid);
  const grant = new d.provider.Grant({
    accountId: ORG,
    clientId: String(details.params.client_id),
  });
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
    expect(meta.grant_types_supported).toEqual(
      expect.arrayContaining(['authorization_code', 'refresh_token']),
    );
    expect(meta.client_id_metadata_document_supported).toBe(true);
    expect(meta.scopes_supported).toEqual(
      expect.arrayContaining(['signups:read', 'signups:write', 'commitments:read']),
    );
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
    const sessionCookie = done.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${OAUTH_COOKIES.session}=`));
    expect(sessionCookie).toMatch(/path=\/api\/oauth/i);

    const tokenRes = await exchangeCode(d, {
      clientId: CLIENT,
      redirectUri: REDIRECT,
      code,
      verifier,
      resource: RESOURCE,
    });
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
    const widen = await refresh(d, {
      clientId: CLIENT,
      refreshToken: t1.refresh_token,
      scope: 'signups:read signups:write commitments:read',
    });
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
    const { uid } = await startAuthorization(d, {
      clientId: CLIENT,
      redirectUri: REDIRECT,
      scope: 'signups:read',
      challenge,
    });
    await approve(uid, ['signups:read']);
    const { code } = codeFromRedirect(await resume(d, uid));
    const first = await exchangeCode(d, {
      clientId: CLIENT,
      redirectUri: REDIRECT,
      code,
      verifier,
    });
    expect(first.status).toBe(200);
    const tokens = await first.json();
    const again = await exchangeCode(d, {
      clientId: CLIENT,
      redirectUri: REDIRECT,
      code,
      verifier,
    });
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
    const { uid } = await startAuthorization(d, {
      clientId: CLIENT,
      redirectUri: REDIRECT,
      scope: 'signups:read',
      challenge,
    });
    await finishInteraction(d, uid, {
      error: 'access_denied',
      error_description: 'The organizer declined',
    });
    const done = await resume(d, uid);
    const loc = new URL(done.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe(REDIRECT);
    expect(loc.searchParams.get('error')).toBe('access_denied');
    expect(loc.searchParams.get('code')).toBeNull();
  });

  it('renders a plain HTML error page for a browser when the client is unknown', async () => {
    const q = new URLSearchParams({
      client_id: 'nope',
      redirect_uri: REDIRECT,
      response_type: 'code',
      scope: 'x',
    });
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
    const first = await startAuthorization(d, {
      clientId: 'web-client',
      redirectUri: 'https://hosted.example/cb',
      scope: 'signups:read',
      challenge,
    });
    await approve(first.uid, ['signups:read']);
    const { code } = codeFromRedirect(await resume(d, first.uid));
    expect(
      (
        await exchangeCode(d, {
          clientId: 'web-client',
          redirectUri: 'https://hosted.example/cb',
          code,
          verifier,
        })
      ).status,
    ).toBe(200);
    // Same browser (same cookie jar → provider session), same client, same scopes.
    const second = await startAuthorization(d, {
      clientId: 'web-client',
      redirectUri: 'https://hosted.example/cb',
      scope: 'signups:read',
      challenge: pkcePair().challenge,
    });
    expect(second.response.status).toBe(303);
    expect(second.response.headers.get('location')).toBe(consentPath(second.uid));
    const details = await interactionDetails(d, second.uid);
    expect(details.prompt.name).toBe('consent');
  });
});

describe('a CIMD client that lists none among its token endpoint auth methods', () => {
  it('is treated as a public client: consent, code exchange without an assertion, refresh', async () => {
    const { verifier, challenge } = pkcePair();
    const { uid, response } = await startAuthorization(d, {
      clientId: CHATGPT,
      redirectUri: CHATGPT_REDIRECT,
      scope: 'signups:read signups:write',
      resource: RESOURCE,
      challenge,
    });
    expect(response.status, await response.clone().text()).toBe(303);
    expect(response.headers.get('location')).toBe(consentPath(uid));

    await approve(uid, ['signups:read', 'signups:write']);
    const { code } = codeFromRedirect(await resume(d, uid));
    const tokenRes = await exchangeCode(d, {
      clientId: CHATGPT,
      redirectUri: CHATGPT_REDIRECT,
      code,
      verifier,
      resource: RESOURCE,
    });
    expect(tokenRes.status, await tokenRes.clone().text()).toBe(200);
    const tokens = await tokenRes.json();
    expect(decodeJwt(tokens.access_token).client_id).toBe(CHATGPT);
    expect(tokens.refresh_token).toBeTruthy();

    const r1 = await refresh(d, { clientId: CHATGPT, refreshToken: tokens.refresh_token });
    expect(r1.status, await r1.clone().text()).toBe(200);
    expect(decodeJwt((await r1.json()).access_token).scope).toBe('signups:read signups:write');
  });

  it('is still rejected when the list does not include none', async () => {
    const { challenge } = pkcePair();
    const { response } = await startAuthorization(d, {
      clientId: KEY_ONLY,
      redirectUri: 'https://keyonly.example/cb',
      scope: 'signups:read',
      challenge,
    });
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toContain('invalid_client_metadata');
    expect(body).toContain('token_endpoint_auth_method must be');
  });
});

describe('the error page a browser is shown', () => {
  /** An authorization request from a client the provider doesn't know. */
  const unknownClient = `${OAUTH_ROUTES.authorization}?${new URLSearchParams({
    client_id: 'nope',
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'x',
  })}`;

  it('reads in English byte for byte as it did before the catalog', () => {
    const page = renderErrorPage(
      { error: 'invalid_client', error_description: 'client is <invalid> & "unknown"' },
      'en',
    );
    expect(page).toBe(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connection failed</title>
<style>
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f7f8fa; color: #0b1220; }
  main { max-width: 32rem; margin: 15vh auto; padding: 0 1.5rem; }
  h1 { font-size: 1.5rem; margin: 0 0 .75rem; }
  p { line-height: 1.5; color: #5b6474; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; background: #eef1f5; padding: .1em .35em; border-radius: .25rem; }
  a { color: #1f6feb; }
</style>
</head>
<body>
<main>
  <h1>This connection could not be completed</h1>
  <p>The application that sent you here made a request we could not accept.</p>
  <p><code>invalid_client</code> — client is &lt;invalid&gt; &amp; &quot;unknown&quot;</p>
  <p>Nothing was connected to your account. Close this window and try again from the application, or <a href="/">go to the home page</a>.</p>
</main>
</body>
</html>`);
  });

  it('says the request could not be completed when the error has no description', () => {
    expect(renderErrorPage({}, 'en')).toContain(
      '<p><code>error</code> — The request could not be completed.</p>',
    );
  });

  it('escapes its own words and keeps the home page link', () => {
    const fake = Object.assign((key: string) => `${key} & <b>`, {
      markup: (_key: string, values: { home: (chunks: string) => string }) =>
        `Q & A, ${values.home('home <now>')}.`,
    });
    text.translator = fake as unknown as Translator<'auth.oauthErrors'>;
    try {
      const page = renderErrorPage({ error: 'e' }, 'en');
      expect(page).toContain('<title>tabTitle &amp; &lt;b&gt;</title>');
      expect(page).toContain('<h1>heading &amp; &lt;b&gt;</h1>');
      expect(page).toContain('<code>e</code> — noDescription &amp; &lt;b&gt;');
      expect(page).toContain('<p>Q &amp; A, <a href="/">home &lt;now&gt;</a>.</p>');
    } finally {
      text.translator = null;
    }
  });

  it('is the one the provider renders, in the language it was built with', async () => {
    const r = await d.get(unknownClient, { accept: 'text/html' });
    const html = await r.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<h1>This connection could not be completed</h1>');
  });

  describe.each(TEST_LOCALES)('in %s', (other) => {
    const ask = (key: string) => `auth.oauthErrors.${key} in ${other}`;

    it('has every word of its own from that language, and the code and description as given', () => {
      const page = renderErrorPage(
        { error: 'invalid_client', error_description: 'client is invalid' },
        other,
      );
      expect(page).toContain(`<html lang="${other}">`);
      expect(page).toContain(`<title>${ask('tabTitle')}</title>`);
      expect(page).toContain(`<h1>${ask('heading')}</h1>`);
      expect(page).toContain(`<p>${ask('intro')}</p>`);
      expect(page).toContain('<p><code>invalid_client</code> — client is invalid</p>');
      expect(page).toContain(`<p>${ask('nothingConnected')}</p>`);
      expect(renderErrorPage({}, other)).toContain(ask('noDescription'));
    });

    it('is what a provider built with it renders', async () => {
      const built = createDriver(buildProvider({ ...deps, errorPageLocale: other }), ISSUER);
      const r = await built.get(unknownClient, { accept: 'text/html' });
      expect(r.status).toBe(400);
      const html = await r.text();
      expect(html).toContain(`<html lang="${other}">`);
      expect(html).toContain(ask('heading'));
      expect(html).toContain('invalid_client');
    });
  });
});
