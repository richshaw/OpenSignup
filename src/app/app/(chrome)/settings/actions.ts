'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { getDb } from '@/db/client';
import { refusalAsResult } from '@/lib/errors';
import { updateOrganizerLocale } from '@/services/organizers';

const SETTINGS_PATH = '/app/settings';

/**
 * Account Settings' "Language for new signups", there once a second language
 * has shipped to participants. Saves the signed-in organizer's own language:
 * the form names no organizer, so it can't change anyone else's. The service
 * refuses a language that hasn't shipped, and a form with no choice in it, and
 * the page shows the refusal by its code. Either way it comes back to Account
 * Settings, with `saved=language` when it saved.
 */
export async function setOrganizerLocaleAction(formData: FormData) {
  const session = await requireOrganizerSession();
  const result = await refusalAsResult(() =>
    updateOrganizerLocale(getDb(), toActor(session), formData.get('locale')),
  );
  if (!result.ok) redirect(`${SETTINGS_PATH}?error=${result.error.code}`);
  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?saved=language`);
}
