'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { getOrganizerAppLocale, newSignupLocale } from '@/i18n/organizer';
import { getServerTranslator } from '@/i18n/server';
import { waitMinutes } from '@/lib/format-duration';
import { refusalText } from '@/lib/organizer-errors';
import { requireWorkspaceWrite } from '@/lib/policy';
import { chargeRateLimit, RateLimits } from '@/lib/rate-limit';
import { createSignup } from '@/services/signups';
import { lfLineBreaks } from './line-breaks';

/**
 * Why the form was refused, in the organizer's language, with what was typed
 * in each box, so the form can put it back. Null before the first submit.
 */
export type NewSignupFormState = { error: string; title: string; description: string } | null;

/**
 * The manual "New signup" form. Charges the same per-organizer create quota
 * `POST /api/signups` and the MCP `create_signup` tool do, so the form is not
 * an uncapped way round it. On success it goes to the new signup's Build
 * page. Refused (over the limit, or the server's checks), it answers why with
 * the title and description as typed, rather than a fresh page that would
 * lose them: the browser can't check a title's length after trimming, so a
 * refusal it let through is not the organizer's fault. The refusal is worded
 * from the catalog by its code and reason (`refusalText`), never with the
 * service's English `message`. The signup starts in the organizer's language
 * (`newSignupLocale`): there's no language choice on the form, and the
 * Settings tab changes it.
 */
export async function createSignupAction(
  _previous: NewSignupFormState,
  formData: FormData,
): Promise<NewSignupFormState> {
  const s = await requireOrganizerSession();
  if (!s.defaultWorkspaceId) redirect('/app');
  const title = String(formData.get('title') ?? '');
  const description = lfLineBreaks(String(formData.get('description') ?? ''));
  const db = getDb();
  const actor = toActor(s);
  const t = getServerTranslator(getOrganizerAppLocale(s), 'organizer.errors');
  // Policy first, as POST /api/signups does: a refusal must not cost a create-quota unit.
  requireWorkspaceWrite(actor, s.defaultWorkspaceId);
  const retryAfter = await chargeRateLimit(db, RateLimits.signupCreatePerOrganizer, s.organizerId);
  if (retryAfter !== null) {
    const error = t('tooManySignups', { minutes: waitMinutes(retryAfter) });
    return { error, title, description };
  }
  const language = newSignupLocale(s);
  const result = await createSignup(
    db,
    actor,
    s.defaultWorkspaceId,
    {
      title,
      description,
      visibility: 'unlisted',
      ...(language ? { settings: { locale: language.locale } } : {}),
    },
    { localeSource: language?.source },
  );
  if (!result.ok) return { error: refusalText(t, result.error), title, description };
  redirect(`/app/signups/${result.value.id}`);
}
