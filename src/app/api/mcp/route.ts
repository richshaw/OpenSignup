import { resolveBearerActor } from '@/auth/bearer';
import { extractClientIp } from '@/auth/request-context';
import { getDb } from '@/db/client';
import { ServiceException } from '@/lib/errors';
import { RateLimits, consumeRateLimit } from '@/lib/rate-limit';
import type { ToolContext } from '@/mcp/context';
import { attachContext, getMcpHandler } from '@/mcp/handler';
import { requiredScopesFor } from '@/mcp/scope-gate';
import { toolScope } from '@/mcp/tools';

/**
 * The MCP endpoint. Order matters: the per-IP limit first (every request
 * costs a signature check), then a peek at the JSON-RPC body to learn which
 * scope a tools/call needs, then the bearer seam, then the SDK. The seam
 * stays the only thing here that knows about authentication.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 1_000_000;

function tooLarge(): Response {
  return Response.json(
    { error: 'payload_too_large', error_description: 'request body too large' },
    { status: 413 },
  );
}

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

  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return tooLarge();

  // Peek on a clone: the SDK reads the original body itself when we cannot
  // hand it a parsed one, and a consumed body would surface as a misleading
  // "could not be read" error instead of the spec's invalid-JSON 400.
  let parsedBody: unknown;
  if (request.method === 'POST') {
    const text = await request.clone().text();
    if (text.length > MAX_BODY_BYTES) return tooLarge();
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = undefined;
    }
  }

  const requiredScopes = requiredScopesFor(parsedBody, toolScope);
  const auth = await resolveBearerActor(request, requiredScopes.length > 0 ? { requiredScopes } : {});
  if (!auth.ok) return auth.response;

  const ctx: ToolContext = {
    db: getDb(),
    actor: auth.actor,
    scopes: auth.scopes,
    clientId: auth.clientId,
    defaultWorkspaceId: auth.defaultWorkspaceId,
    workspaces: auth.workspaces,
  };
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const authInfo = attachContext({ token, clientId: auth.clientId, scopes: auth.scopes }, ctx);
  return getMcpHandler().fetch(request, parsedBody === undefined ? { authInfo } : { authInfo, parsedBody });
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
