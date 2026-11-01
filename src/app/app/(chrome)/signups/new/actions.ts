'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { waitInMinutes } from '@/lib/format-duration';
import { chargeRateLimit, RateLimits } from '@/lib/rate-limit';
import { createSignup } from '@/services/signups';

/**
 * Why the form was refused, with what was typed in each box, so the form can
 * put it back. Null before the first submit.
 */
export type NewSignupFormState = { error: string; title: string; description: string } | null;

/**
 * The manual "New signup" form. Charges the same per-organizer create quota
 * `POST /api/signups` and the MCP `create_signup` tool do, so the form is not
 * an uncapped way round it. On success it goes to the new signup's Build
 * page. Refused (over the limit, or the server's checks), it answers why with
 * the title and description as typed, rather than a fresh page that would
 * lose them: the browser can't check a title's length after trimming, so a
 * refusal it let through is not the organizer's fault.
 */
export async function createSignupAction(
  _previous: NewSignupFormState,
  formData: FormData,
): Promise<NewSignupFormState> {
  const s = await requireOrganizerSession();
  if (!s.defaultWorkspaceId) redirect('/app');
  const title = String(formData.get('title') ?? '');
  const description = String(formData.get('description') ?? '');
  const db = getDb();
  const retryAfter = await chargeRateLimit(db, RateLimits.signupCreatePerOrganizer, s.organizerId);
  if (retryAfter !== null) {
    const error = `You’ve created a lot of signups in the last hour. Try again in about ${waitInMinutes(retryAfter)}.`;
    return { error, title, description };
  }
  const result = await createSignup(db, toActor(s), s.defaultWorkspaceId, {
    title,
    description,
    visibility: 'unlisted',
  });
  if (!result.ok) return { error: result.error.message, title, description };
  redirect(`/app/signups/${result.value.id}`);
}
