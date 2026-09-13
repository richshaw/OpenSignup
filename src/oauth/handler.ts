import { extractClientIp } from '@/auth/request-context';
import { getDb } from '@/db/client';
import { ServiceException } from '@/lib/errors';
import { log } from '@/lib/log';
import { RateLimits, consumeRateLimit, type RateLimitPolicy } from '@/lib/rate-limit';
import { OAUTH_ROUTES, oauthIssuer } from './config';
import { getProvider } from './instance';
import { invokeNodeHandler } from './node-shim';
import { renderErrorPage } from './provider';

/**
 * The one entry point every OAuth route handler calls. Meters the request,
 * then hands it to the provider through the shim.
 *
 * `path` overrides what the provider's router sees; the well-known routes use
 * it so the same document can be served under both discovery names.
 */
export async function handleOAuthRequest(request: Request, opts: { path?: string } = {}): Promise<Response> {
  const ip = extractClientIp(request.headers);
  const path = opts.path ?? new URL(request.url).pathname;
  // Only an explicit override changes what the provider's router sees; the
  // shim otherwise forwards the public path *with* its query string, which
  // the authorization endpoint depends on.
  const providerPath = opts.path;

  if (request.method !== 'OPTIONS') {
    try {
      // Null and unknown IPs share one bucket rather than skipping the limit,
      // so a deployment missing x-forwarded-for degrades to a shared cap.
      await consumeRateLimit(getDb(), policyFor(path), ip ?? 'unknown');
    } catch (err) {
      if (err instanceof ServiceException && err.serviceError.code === 'rate_limited') {
        const retry = err.serviceError.details?.retryAfterSeconds;
        log.warn({ path, ip, bucket: err.serviceError.details?.bucket }, 'oauth: rate-limited');
        return rateLimited(request, typeof retry === 'number' ? retry : 60);
      }
      throw err;
    }
  }

  const provider = await getProvider();
  return invokeNodeHandler(provider.callback(), request, {
    origin: oauthIssuer(),
    clientIp: ip,
    ...(providerPath ? { path: providerPath } : {}),
  });
}

function policyFor(path: string): RateLimitPolicy {
  if (path === OAUTH_ROUTES.token) return RateLimits.oauthTokenPerIp;
  if (path === OAUTH_ROUTES.authorization || path.startsWith(`${OAUTH_ROUTES.authorization}/`)) {
    return RateLimits.oauthAuthorizePerIp;
  }
  return RateLimits.oauthOtherPerIp;
}

function rateLimited(request: Request, retryAfterSeconds: number): Response {
  const headers: Record<string, string> = { 'Retry-After': String(retryAfterSeconds), 'Cache-Control': 'no-store' };
  const wantsHtml = (request.headers.get('accept') ?? '').includes('text/html');
  if (wantsHtml) {
    return new Response(
      renderErrorPage({ error: 'too_many_requests', error_description: 'Too many requests. Wait a minute and try again.' }),
      { status: 429, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
  return Response.json(
    { error: 'too_many_requests', error_description: 'too many requests' },
    { status: 429, headers },
  );
}
