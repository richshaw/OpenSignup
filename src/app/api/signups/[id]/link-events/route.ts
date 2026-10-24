import { organizerRoute } from '@/lib/organizer-route';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { recordSignupLinkEvent } from '@/services/signup-link-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A beacon from the organizer's pages when they copy or share a signup's
 * link: `?event=copied&surface=…`, no body. Behind the organizer's session
 * rather than a per-IP rate limit, since only a signed-in member of the
 * signup's workspace can write one, and metered per organizer, since a viewer
 * can too.
 */
export const POST = organizerRoute<{ id: string }>(async ({ req, db, actor, params: { id } }) => {
  await consumeRateLimit(db, RateLimits.signupLinkEventsPerOrganizer, actor.id);
  const query = new URL(req.url).searchParams;
  return recordSignupLinkEvent(db, actor, id, {
    event: query.get('event'),
    surface: query.get('surface'),
  });
});
