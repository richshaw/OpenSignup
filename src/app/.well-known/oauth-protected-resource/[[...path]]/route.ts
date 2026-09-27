import { MCP_RESOURCE_PATH, mcpResourceUrl, oauthIssuer } from '@/oauth/config';
import { protectedResourceMetadata } from '@/oauth/resource-metadata';

/**
 * RFC 9728 protected-resource metadata for the MCP endpoint. Served at both
 * the path-suffixed form (`/.well-known/oauth-protected-resource/api/mcp`,
 * which the 401 challenge names) and the bare form some clients probe.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'mcp-protocol-version',
};

function known(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return (
    pathname === '/.well-known/oauth-protected-resource' ||
    pathname === `/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`
  );
}

export function GET(request: Request) {
  if (!known(request)) return new Response(null, { status: 404, headers: CORS });
  return Response.json(protectedResourceMetadata(oauthIssuer(), mcpResourceUrl()), {
    headers: { ...CORS, 'Cache-Control': 'public, max-age=300' },
  });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
