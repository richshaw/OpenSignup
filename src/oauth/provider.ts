import Provider, {
  errors,
  type AdapterConstructor,
  type AdapterFactory,
  type ClientMetadata,
  type Configuration,
  type KoaContextWithOIDC,
} from 'oidc-provider';
import type { JWK } from 'jose';
import { log } from '@/lib/log';
import {
  CONSENT_PATH_PREFIX,
  OAUTH_COOKIES,
  OAUTH_ROUTES,
  OAUTH_SESSION_COOKIE_PATH,
  OAUTH_TTL,
  PROVIDER_SCOPES,
  RESOURCE_SCOPE_STRING,
  SIGNING_ALG,
  consentPath,
} from './config';
import type { StaticClient } from './static-clients';

/**
 * Everything the provider needs from the outside world, so the configuration
 * can be exercised in a unit test with an in-memory adapter and no database.
 * `getProvider()` in `./instance.ts` wires the real dependencies.
 */
export interface ProviderDeps {
  issuer: string;
  /** The MCP endpoint URL; the only resource tokens are ever bound to. */
  resource: string;
  /** Private signing keys, newest first. */
  jwks: { keys: JWK[] };
  /** Keys used to sign the provider's cookies. */
  cookieKeys: string[];
  adapter?: AdapterConstructor | AdapterFactory;
  staticClients: StaticClient[];
  /** Whether the organizer behind `sub` still exists; false invalidates tokens. */
  organizerExists(id: string): Promise<boolean>;
  /** An existing grant to extend rather than duplicate, if any. */
  findGrantId(accountId: string, clientId: string): Promise<string | undefined>;
  /** Rate-limit gate in front of every CIMD metadata fetch. */
  allowCimdFetch(clientId: string): Promise<boolean>;
  /** Called after any successful token-endpoint use of a grant. */
  onGrantUsed(grantId: string): Promise<void>;
  /** Override outbound HTTP (CIMD documents) — tests only. */
  fetch?: Configuration['fetch'];
}

export function buildProvider(deps: ProviderDeps): Provider {
  const config: Configuration = {
    adapter: deps.adapter,
    jwks: deps.jwks,
    clients: deps.staticClients.map(toClientMetadata),
    clientDefaults: {
      // RFC 8252 §7.3: loopback redirect URIs match on any port. Every MCP
      // client we care about is a native app with an ephemeral callback port
      // and a CIMD document that lists the port-less form.
      application_type: 'native',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      // Also the default alg for JWT access tokens; our keystore is EC only.
      id_token_signed_response_alg: SIGNING_ALG,
    },
    clientAuthMethods: ['none'],
    responseTypes: ['code'],
    scopes: PROVIDER_SCOPES,
    claims: { openid: ['sub'] },
    pkce: { required: () => true },
    routes: OAUTH_ROUTES,
    cookies: {
      keys: deps.cookieKeys,
      names: OAUTH_COOKIES,
      long: { path: OAUTH_SESSION_COOKIE_PATH, sameSite: 'lax', httpOnly: true },
      short: { sameSite: 'lax', httpOnly: true },
    },
    ttl: {
      AccessToken: OAUTH_TTL.ACCESS_TOKEN,
      AuthorizationCode: OAUTH_TTL.AUTHORIZATION_CODE,
      Interaction: OAUTH_TTL.INTERACTION,
      Session: OAUTH_TTL.SESSION,
      Grant: OAUTH_TTL.GRANT_MAX,
      // Rotation hands out a fresh window each time, but never past
      // GRANT_MAX from the original approval: `iiat` is copied across
      // rotations, so this is the hard ceiling regardless of activity.
      RefreshToken: (_ctx, token) => {
        const now = Math.floor(Date.now() / 1000);
        const first = (token as { iiat?: number; iat?: number }).iiat ?? token.iat ?? now;
        const remaining = first + OAUTH_TTL.GRANT_MAX - now;
        return Math.max(1, Math.min(OAUTH_TTL.REFRESH_TOKEN, remaining));
      },
    },
    rotateRefreshToken: true,
    // Every client is a long-lived agent; `offline_access` is accepted but not
    // required, since not every MCP client sends it.
    issueRefreshToken: async () => true,
    // Refresh tokens outlive the provider's login session. Without this a
    // refresh silently fails once the OP session (a day, see SESSION) ends.
    expiresWithSession: async () => false,
    interactions: {
      url: (_ctx, interaction) => consentPath(interaction.uid),
    },
    async loadExistingGrant(ctx) {
      const fromResult = ctx.oidc.result?.consent?.grantId;
      if (typeof fromResult === 'string') return ctx.oidc.provider.Grant.find(fromResult);
      const accountId = ctx.oidc.session?.accountId;
      const clientId = ctx.oidc.client?.clientId;
      if (!accountId || !clientId) return undefined;
      const grantId = await deps.findGrantId(accountId, clientId);
      return grantId ? ctx.oidc.provider.Grant.find(grantId) : undefined;
    },
    async findAccount(_ctx, sub) {
      if (!(await deps.organizerExists(sub))) return undefined;
      return { accountId: sub, claims: async () => ({ sub }) };
    },
    renderError: async (ctx, out) => {
      ctx.type = 'html';
      ctx.body = renderErrorPage(out);
    },
    fetch: deps.fetch,
    features: {
      // The library's built-in login page accepts any credentials. Off.
      devInteractions: { enabled: false },
      dPoP: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      userinfo: { enabled: false },
      introspection: { enabled: false },
      registration: { enabled: false },
      revocation: { enabled: true },
      pushedAuthorizationRequests: { enabled: true },
      clientIdMetadataDocument: {
        enabled: true,
        ack: 'draft-02',
        allowFetch: (_ctx, clientId) => deps.allowCimdFetch(clientId),
        cacheDuration: { min: 300, max: 3600 },
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: async () => deps.resource,
        useGrantedResource: async () => true,
        getResourceServerInfo: async (_ctx, resourceIndicator) => {
          if (resourceIndicator !== deps.resource) {
            throw new errors.InvalidTarget('unknown resource');
          }
          return {
            scope: RESOURCE_SCOPE_STRING,
            audience: deps.resource,
            accessTokenTTL: OAUTH_TTL.ACCESS_TOKEN,
            accessTokenFormat: 'jwt',
            jwt: { sign: { alg: SIGNING_ALG } },
          };
        },
      },
    },
  };

  const provider = new Provider(deps.issuer, config);
  provider.proxy = true;

  provider.on('server_error', (ctx: KoaContextWithOIDC, err: Error) => {
    log.error({ err, path: ctx.path }, 'oauth: server error');
  });
  provider.on('authorization.error', (ctx: KoaContextWithOIDC, err: OidcError) => {
    log.warn(
      { error: err.error, description: err.error_description, clientId: ctx.oidc?.params?.client_id },
      'oauth: authorization error',
    );
  });
  provider.on('grant.error', (_ctx: KoaContextWithOIDC, err: OidcError) => {
    log.warn({ error: err.error, description: err.error_description }, 'oauth: token error');
  });
  provider.on('grant.success', (ctx: KoaContextWithOIDC) => {
    const grantId = ctx.oidc.entities.Grant?.jti;
    if (grantId) {
      deps.onGrantUsed(grantId).catch((err) => log.warn({ err }, 'oauth: onGrantUsed failed'));
    }
  });

  return provider;
}

interface OidcError {
  error?: string;
  error_description?: string;
}

function toClientMetadata(c: StaticClient): ClientMetadata {
  return {
    client_id: c.client_id,
    client_name: c.client_name,
    redirect_uris: c.redirect_uris,
    token_endpoint_auth_method: 'none',
    application_type: 'native',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Shown to a browser when the authorization request itself is broken — a bad
 * redirect URI, an unknown client — and the error cannot be sent back to
 * the client. Deliberately plain and self-contained: at this point nothing
 * about the request can be trusted, so it renders no user-supplied value
 * except the escaped error code and description.
 */
export function renderErrorPage(out: OidcError): string {
  const code = escapeHtml(out.error ?? 'error');
  const description = escapeHtml(out.error_description ?? 'The request could not be completed.');
  return `<!doctype html>
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
  <p><code>${code}</code> — ${description}</p>
  <p>Nothing was connected to your account. Close this window and try again from the application, or <a href="/">go to the home page</a>.</p>
</main>
</body>
</html>`;
}

export { CONSENT_PATH_PREFIX };
