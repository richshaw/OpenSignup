import { resolveBearerActor } from '@/auth/bearer';

/**
 * Placeholder for the MCP endpoint. It exists so the authorization server is
 * testable end to end before the MCP server lands: an unauthenticated
 * request gets the RFC 9728 challenge that starts client discovery, and a
 * valid token gets a small JSON body naming the organizer and scopes. The
 * MCP epic replaces the body of this handler; the `resolveBearerActor` call
 * is the seam it keeps.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(request: Request): Promise<Response> {
  const auth = await resolveBearerActor(request);
  if (!auth.ok) return auth.response;
  return Response.json(
    {
      data: {
        organizerId: auth.actor.id,
        email: auth.actor.email,
        workspaceIds: auth.actor.workspaceIds,
        scopes: auth.scopes,
        clientId: auth.clientId,
        mcp: 'not yet available',
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
