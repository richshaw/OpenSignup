import { handleOAuthRequest } from '@/oauth/handler';

/**
 * Every OAuth 2.1 endpoint — authorize, token, jwks, revoke, par — served by
 * the authorization server in `src/oauth/`. The path map is `OAUTH_ROUTES`
 * in `src/oauth/config.ts`.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request) {
  return handleOAuthRequest(request);
}
export function POST(request: Request) {
  return handleOAuthRequest(request);
}
export function OPTIONS(request: Request) {
  return handleOAuthRequest(request);
}
