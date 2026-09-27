import { redirect } from 'next/navigation';
import { requireActor } from '@/auth/session';
import { getDb } from '@/db/client';
import { ServiceException } from '@/lib/errors';
import { log } from '@/lib/log';
import { RateLimits, consumeRateLimit } from '@/lib/rate-limit';
import { consentPath, isInteractionUid, oauthIssuer } from '@/oauth/config';
import { ConsentUnavailable, decideConsent, type Decision } from '@/oauth/consent';
import { renderErrorPage } from '@/oauth/provider';

/**
 * Receives the Allow / Don't allow submit from the consent page.
 *
 * Cross-site protection is layered: the provider's interaction cookie and
 * the Auth.js session cookie are both SameSite=Lax, so neither arrives on a
 * cross-site POST, and on top of that the request must prove where it came
 * from — an Origin header (every browser sends one on a form POST) or,
 * failing that, a same-origin Referer. A request with neither is refused
 * rather than waved through on cookies alone.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  if (!isInteractionUid(uid)) return new Response('Not found', { status: 404 });

  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });

  const actor = await requireActor();
  if (actor.kind !== 'organizer') {
    redirect(`/login?callbackUrl=${encodeURIComponent(consentPath(uid))}`);
  }

  const form = await request.formData().catch(() => null);
  const raw = form?.get('decision');
  const decision: Decision = raw === 'approve' ? 'approve' : 'deny';

  try {
    await consumeRateLimit(getDb(), RateLimits.oauthConsentPerOrganizer, actor.id);
    return await decideConsent(uid, actor, decision);
  } catch (err) {
    if (err instanceof ConsentUnavailable) {
      redirect(consentPath(uid));
    }
    if (err instanceof ServiceException && err.serviceError.code === 'rate_limited') {
      return html(429, 'too_many_requests', 'Too many connection attempts. Wait a while and try again.');
    }
    log.error({ err }, 'oauth: consent decision failed');
    return html(500, 'server_error', 'Something went wrong recording your decision. Nothing was connected.');
  }
}

function sameOrigin(request: Request): boolean {
  const issuer = oauthIssuer();
  const origin = request.headers.get('origin');
  if (origin !== null) return origin === issuer;
  const referer = request.headers.get('referer');
  if (referer === null) return false;
  try {
    return new URL(referer).origin === issuer;
  } catch {
    return false;
  }
}

function html(status: number, error: string, description: string): Response {
  return new Response(renderErrorPage({ error, error_description: description }), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
