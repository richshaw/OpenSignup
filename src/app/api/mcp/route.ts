import { resolveBearerActor } from '@/auth/bearer';
import { extractClientIp } from '@/auth/request-context';
import { getDb } from '@/db/client';
import { ServiceException } from '@/lib/errors';
import { RateLimits, consumeRateLimit } from '@/lib/rate-limit';

/**
 * Placeholder for the MCP endpoint. It exists so the authorization server is
 * testable end to end before the MCP server lands: an unauthenticated
 * request gets the RFC 9728 challenge that starts client discovery, and a
 * valid token gets a small JSON body saying so and echoing the token's
 * scopes — nothing about the account, since no scope has been checked for
 * that. The MCP epic replaces the body of this handler; the
 * `resolveBearerActor` call is the seam it keeps.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(request: Request): Promise<Response> {
  try {
    await consumeRateLimit(getDb(), RateLimits.mcpPerIp, extractClientIp(request.headers) ?? 'unknown');
  } catch (err) {
    if (err instanceof ServiceException && err.serviceError.code === 'rate_limited') {
      const retry = err.serviceError.details?.retryAfterSeconds;
      return Response.json(
        { error: 'too_many_requests', error_description: 'too many requests' },
        { status: 429, headers: { 'Retry-After': String(typeof retry === 'number' ? retry : 60) } },
      );
    }
    throw err;
  }
  const auth = await resolveBearerActor(request);
  if (!auth.ok) return auth.response;
  return Response.json(
    { data: { authenticated: true, scopes: auth.scopes, mcp: 'not yet available' } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
