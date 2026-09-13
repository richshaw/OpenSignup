import { handleOAuthRequest } from '@/oauth/handler';

/**
 * OpenID discovery alias for the same document. Some clients (and
 * `mcp-auth`-style verifiers) probe this name first.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request) {
  return handleOAuthRequest(request, { path: '/.well-known/openid-configuration' });
}
export function OPTIONS(request: Request) {
  return handleOAuthRequest(request, { path: '/.well-known/openid-configuration' });
}
