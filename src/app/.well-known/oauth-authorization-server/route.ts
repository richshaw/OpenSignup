import { handleOAuthRequest } from '@/oauth/handler';

/** RFC 8414 authorization-server metadata. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request) {
  return handleOAuthRequest(request, { path: '/.well-known/oauth-authorization-server' });
}
export function OPTIONS(request: Request) {
  return handleOAuthRequest(request, { path: '/.well-known/oauth-authorization-server' });
}
