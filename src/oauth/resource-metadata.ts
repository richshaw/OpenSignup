import {
  buildOAuthProtectedResourceMetadata,
  getOAuthProtectedResourceMetadataUrl,
  type OAuthMetadata,
  type OAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/server';
import { ADVERTISED_SCOPE_LIST, OAUTH_ROUTES } from './config';

/**
 * RFC 9728 protected-resource metadata for the MCP endpoint, built by the
 * official MCP SDK from the same constants the authorization server is
 * configured with, so the two cannot drift.
 */
export function protectedResourceMetadata(issuer: string, resource: string): OAuthProtectedResourceMetadata {
  return buildOAuthProtectedResourceMetadata({
    oauthMetadata: minimalAuthorizationServerMetadata(issuer),
    resourceServerUrl: new URL(resource),
    scopesSupported: ADVERTISED_SCOPE_LIST,
    resourceName: 'OpenSignup',
    // Local development runs the issuer over plain http; nothing else may.
    dangerouslyAllowInsecureIssuerUrl: isLoopbackHttp(issuer),
  });
}

function isLoopbackHttp(issuer: string): boolean {
  const url = new URL(issuer);
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export function protectedResourceMetadataUrl(resource: string): string {
  return getOAuthProtectedResourceMetadataUrl(new URL(resource));
}

/** Only `issuer` is read by the SDK; the rest satisfies the type honestly. */
function minimalAuthorizationServerMetadata(issuer: string): OAuthMetadata {
  return {
    issuer,
    authorization_endpoint: `${issuer}${OAUTH_ROUTES.authorization}`,
    token_endpoint: `${issuer}${OAUTH_ROUTES.token}`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}
