'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { getDb } from '@/db/client';
import { refusalAsResult } from '@/lib/errors';
import { answerLanguageNotice } from '@/services/organizers';

/**
 * The two buttons on the notice that offers Swedish on Your signups (#640):
 * "Use Swedish" sends `sv` and "Keep English" sends `en`. Either saves the
 * signed-in organizer's own language for new signups (the form names no
 * organizer, so it can't change anyone else's), which takes the notice away.
 *
 * Keep English comes back to Your signups. Use Swedish goes on to account
 * Settings as its own Save does (`saved=language`), where "Language for new
 * signups" says Saved and, when any of the organizer's open signups is in
 * another language, asks "Use Svenska for your open signups too?" (#639). A
 * refusal, such as a language that hasn't shipped, shows there by its code.
 */
export async function answerSwedishNoticeAction(formData: FormData) {
  const session = await requireOrganizerSession();
  const result = await refusalAsResult(() =>
    answerLanguageNotice(getDb(), toActor(session), formData.get('locale')),
  );
  if (!result.ok) redirect(`/app/settings?error=${result.error.code}`);
  revalidatePath('/app');
  if (result.value.locale === 'en') redirect('/app');
  revalidatePath('/app/settings');
  redirect('/app/settings?saved=language');
}
