import { resolveBearerActor } from '@/auth/bearer';
import { extractClientIp } from '@/auth/request-context';
import { getDb } from '@/db/client';
import { ServiceException } from '@/lib/errors';
import { RateLimits, consumeRateLimit, type RateLimitPolicy } from '@/lib/rate-limit';
import { BodyTooLarge, readRequestBody } from '@/lib/request-body';
import type { ToolContext } from '@/mcp/context';
import { attachContext, getMcpHandler } from '@/mcp/handler';
import { countToolCalls, requiredScopesFor } from '@/mcp/scope-gate';
import { toolScope } from '@/mcp/tools';

/**
 * The MCP endpoint. Order matters, and every step before the seam is bounded
 * work an unauthenticated caller can trigger: a free method and size check,
 * the per-IP limit (every request costs a signature check), a capped body
 * read, a peek at the JSON-RPC body to learn which scope a tools/call needs,
 * then the bearer seam, the per-organizer limit (charged per tools/call), and
 * the SDK. The seam stays the only thing here that knows about authentication.
 *
 * The route parses the body itself rather than handing the request to the SDK
 * to read, because it has to see the method and tool name before the seam
 * runs. That makes malformed JSON this route's error to answer, not the SDK's.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 1_000_000;
/** A 2025-era client may batch JSON-RPC messages; each tools/call is a DB round trip. */
const MAX_BATCH = 20;

function rpcError(status: number, code: number, message: string, headers?: HeadersInit): Response {
  return Response.json({ jsonrpc: '2.0', error: { code, message }, id: null }, { status, headers });
}

function tooLarge(): Response {
  return Response.json(
    { error: 'payload_too_large', error_description: 'request body too large' },
    { status: 413 },
  );
}

/** Consume `cost` units or answer 429; anything but a rate limit is rethrown. */
async function meter(policy: RateLimitPolicy, subject: string, cost = 1): Promise<Response | null> {
  try {
    await consumeRateLimit(getDb(), policy, subject, cost);
    return null;
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
}

/**
 * There are no sessions, so there is no server-push stream to open: the SDK
 * would answer 405 itself, but only after a token check and a session read
 * that a constant answer does not need. Clients try this once after
 * initialize and move on.
 */
export function GET(): Response {
  // RFC 9110 makes Allow a MUST on a 405.
  return rpcError(405, -32000, 'Method not allowed: this server has no session stream', {
    Allow: 'POST',
  });
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge();

  const ipLimited = await meter(RateLimits.mcpPerIp, extractClientIp(request.headers) ?? 'unknown');
  if (ipLimited) return ipLimited;

  let raw: Buffer;
  try {
    raw = await readRequestBody(request, MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLarge) return tooLarge();
    throw err;
  }
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw.toString('utf8'));
  } catch {
    return rpcError(400, -32700, 'Parse error: the request body is not valid JSON');
  }
  if (Array.isArray(parsedBody) && parsedBody.length > MAX_BATCH) {
    return rpcError(400, -32600, `Invalid request: at most ${MAX_BATCH} messages per batch`);
  }

  const requiredScopes = requiredScopesFor(parsedBody, toolScope);
  const auth = await resolveBearerActor(request, { requiredScopes });
  if (!auth.ok) return auth.response;

  // Charged per tools/call, not per request: a batch of 20 does 20 round trips
  // to the database, and charging it one unit would let a token do twenty times
  // the work the limit is meant to allow. The per-IP limit above stays per
  // request, because one address is shared by every organizer using a hosted
  // assistant. A batch that crosses the line is refused whole; the window is
  // a minute.
  const organizerLimited = await meter(
    RateLimits.mcpPerOrganizer,
    auth.actor.id,
    Math.max(1, countToolCalls(parsedBody)),
  );
  if (organizerLimited) return organizerLimited;

  const ctx: ToolContext = {
    db: getDb(),
    actor: auth.actor,
    scopes: auth.scopes,
    clientId: auth.clientId,
    defaultWorkspaceId: auth.defaultWorkspaceId,
    workspaces: auth.workspaces,
  };
  // The body is already consumed; the SDK never reads it when parsedBody is given.
  return getMcpHandler().fetch(request, { authInfo: attachContext(auth.authInfo, ctx), parsedBody });
}
