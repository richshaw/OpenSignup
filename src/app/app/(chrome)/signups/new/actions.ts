'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { chargeRateLimit, RateLimits } from '@/lib/rate-limit';
import { createSignup } from '@/services/signups';

const NEW_PATH = '/app/signups/new?manual=1';

/**
 * The manual "New signup" form. Charges the same per-organizer create quota
 * `POST /api/signups` and the MCP `create_signup` tool do, so the form is not
 * an uncapped way round it. Over the limit, it comes back to the form saying
 * how long to wait rather than reaching the error page.
 */
export async function createSignupAction(formData: FormData) {
  const s = await requireOrganizerSession();
  if (!s.defaultWorkspaceId) redirect('/app');
  const db = getDb();
  const retryAfter = await chargeRateLimit(db, RateLimits.signupCreatePerOrganizer, s.organizerId);
  if (retryAfter !== null) {
    const minutes = Math.max(1, Math.ceil(retryAfter / 60));
    const message = `You’ve created a lot of signups in the last hour. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
    redirect(`${NEW_PATH}&error=${encodeURIComponent(message)}`);
  }
  const result = await createSignup(db, toActor(s), s.defaultWorkspaceId, {
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    visibility: 'unlisted',
  });
  if (!result.ok) {
    redirect(`${NEW_PATH}&error=${encodeURIComponent(result.error.message)}`);
  }
  redirect(`/app/signups/${result.value.id}`);
}
