import { getDb } from '@/db/client';
import { extractClientIp } from '@/auth/request-context';
import { fail, handle } from '@/lib/api-response';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { optOutOfReminders } from '@/services/reminder-optout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Applies a reminder opt-out.
 *
 * POST rather than GET so that link scanners and mail-client prefetchers
 * cannot unsubscribe someone by merely following a link. It is also the
 * target of the `List-Unsubscribe-Post` header, so a mail client may call it
 * unattended — which is safe: the token authenticates the request and the
 * operation is idempotent.
 *
 * Accepts a form post (what both our confirm page and One-Click send) and
 * returns the participant to a confirmation page.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const clientIp = extractClientIp(new Headers(request.headers));
    await consumeRateLimit(getDb(), RateLimits.reminderOptOutPerIp, clientIp ?? 'unknown');

    const form = await request.formData().catch(() => null);
    const url = new URL(request.url);
    const participantId = String(form?.get('p') ?? url.searchParams.get('p') ?? '');
    const token = String(form?.get('token') ?? url.searchParams.get('token') ?? '');

    const result = await optOutOfReminders(getDb(), participantId, token);
    if (!result.ok) return fail(result.error);

    // A One-Click client wants a bare 200 and ignores the body; a person who
    // submitted our form wants to land somewhere that says it worked.
    if (request.headers.get('accept')?.includes('text/html')) {
      return Response.redirect(
        new URL(`/s/${result.value.signupSlug}/unsubscribe?done=1`, url.origin),
        303,
      );
    }
    return new Response(null, { status: 200 });
  });
}
