import { createHash, randomBytes } from 'node:crypto';
import type Provider from 'oidc-provider';
import { OAUTH_ROUTES, consentPath } from '../config';
import { invokeNodeHandler, withNodePair } from '../node-shim';

/**
 * Drives an `oidc-provider` instance through the shim the way a browser and
 * an MCP client would, for tests. Not imported by application code.
 */

export class CookieJar {
  private readonly cookies = new Map<string, string>();
  absorb(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const eq = pair!.indexOf('=');
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();
      const expires = /expires=([^;]+)/i.exec(raw)?.[1];
      if (expires && new Date(expires).getTime() < Date.now()) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  has(name: string): boolean {
    return this.cookies.has(name);
  }
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export interface Driver {
  provider: Provider;
  issuer: string;
  jar: CookieJar;
  clientIp: string;
  get(path: string, headers?: Record<string, string>): Promise<Response>;
  post(path: string, form: Record<string, string>, headers?: Record<string, string>): Promise<Response>;
}

export function createDriver(provider: Provider, issuer: string): Driver {
  const jar = new CookieJar();
  const handler = provider.callback();
  const clientIp = '203.0.113.10';
  async function send(request: Request): Promise<Response> {
    const response = await invokeNodeHandler(handler, request, { origin: issuer, clientIp });
    jar.absorb(response);
    return response;
  }
  return {
    provider,
    issuer,
    jar,
    clientIp,
    get: (path, headers = {}) =>
      send(new Request(`${issuer}${path}`, { headers: { cookie: jar.header(), ...headers } })),
    post: (path, form, headers = {}) =>
      send(
        new Request(`${issuer}${path}`, {
          method: 'POST',
          headers: {
            cookie: jar.header(),
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
            ...headers,
          },
          body: new URLSearchParams(form).toString(),
        }),
      ),
  };
}

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  scope: string;
  resource?: string;
  challenge: string;
  state?: string;
}

/** Start an authorization; returns the interaction uid from the redirect. */
export async function startAuthorization(d: Driver, p: AuthorizeParams): Promise<{ uid: string; response: Response }> {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: p.scope,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    ...(p.resource ? { resource: p.resource } : {}),
    ...(p.state ? { state: p.state } : {}),
  });
  const response = await d.get(`${OAUTH_ROUTES.authorization}?${q}`, { accept: 'text/html' });
  const location = response.headers.get('location') ?? '';
  const uid = location.split('/').pop() ?? '';
  return { uid, response };
}

/** What the consent page would read. */
export async function interactionDetails(d: Driver, uid: string) {
  const request = new Request(`${d.issuer}${consentPath(uid)}`, { headers: { cookie: d.jar.header() } });
  const { value } = await withNodePair(request, { origin: d.issuer, clientIp: d.clientIp }, (req, res) =>
    d.provider.interactionDetails(req, res),
  );
  return value;
}

/** Submit an interaction result the way the decision route does. */
export async function finishInteraction(
  d: Driver,
  uid: string,
  result: Record<string, unknown>,
): Promise<Response> {
  const request = new Request(`${d.issuer}${consentPath(uid)}/decision`, {
    method: 'POST',
    headers: { cookie: d.jar.header() },
  });
  const { response } = await withNodePair(request, { origin: d.issuer, clientIp: d.clientIp }, (req, res) =>
    d.provider.interactionFinished(req, res, result, { mergeWithLastSubmission: false }),
  );
  d.jar.absorb(response);
  return response;
}

/** Follow the resume redirect; returns the final redirect to the client. */
export async function resume(d: Driver, uid: string): Promise<Response> {
  return d.get(`${OAUTH_ROUTES.authorization}/${uid}`, { accept: 'text/html' });
}

export function codeFromRedirect(response: Response): { code: string; iss: string | null; state: string | null } {
  const location = new URL(response.headers.get('location') ?? 'http://invalid/');
  return {
    code: location.searchParams.get('code') ?? '',
    iss: location.searchParams.get('iss'),
    state: location.searchParams.get('state'),
  };
}

export async function exchangeCode(
  d: Driver,
  p: { clientId: string; redirectUri: string; code: string; verifier: string; resource?: string },
): Promise<Response> {
  return d.post(OAUTH_ROUTES.token, {
    grant_type: 'authorization_code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    code: p.code,
    code_verifier: p.verifier,
    ...(p.resource ? { resource: p.resource } : {}),
  });
}

export async function refresh(
  d: Driver,
  p: { clientId: string; refreshToken: string; resource?: string; scope?: string },
): Promise<Response> {
  return d.post(OAUTH_ROUTES.token, {
    grant_type: 'refresh_token',
    client_id: p.clientId,
    refresh_token: p.refreshToken,
    ...(p.resource ? { resource: p.resource } : {}),
    ...(p.scope ? { scope: p.scope } : {}),
  });
}
