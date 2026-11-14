'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { getDb } from '@/db/client';
import { getOrganizerLocale } from '@/i18n/organizer';
import { refusalAsResult } from '@/lib/errors';
import { updateOrganizerLocale } from '@/services/organizers';
import { setOpenSignupsLocale } from '@/services/signups';

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

/**
 * Account Settings' "Switch your 3 open signups to Svenska". Puts the
 * signed-in organizer's open signups (`setOpenSignupsLocale` says which count)
 * in the language the page offers: theirs for new signups, worked out here as
 * the page does (`getOrganizerLocale`). It reads nothing from the form, which
 * sends nothing, so a forged one can't name another language, or anyone
 * else's signups.
 *
 * Comes back with `switched=` how many it changed, which the page shows once
 * none is left in another language. A press that finds none left changes
 * nothing and stays where it is: so the second tap of a double tap, which
 * waits for the first, leaves the first one's answer on the page. A refusal
 * comes back by its code, as above.
 */
export async function switchOpenSignupsLocaleAction(_form: FormData) {
  const session = await requireOrganizerSession();
  const { locale } = getOrganizerLocale(session, 'participant');
  const result = await refusalAsResult(() =>
    setOpenSignupsLocale(getDb(), toActor(session), locale),
  );
  if (!result.ok) redirect(`${SETTINGS_PATH}?error=${result.error.code}`);
  const { signupIds } = result.value;
  for (const signupId of signupIds) {
    revalidatePath(`/app/signups/${signupId}`, 'layout');
  }
  revalidatePath(SETTINGS_PATH);
  if (signupIds.length > 0) redirect(`${SETTINGS_PATH}?switched=${signupIds.length}`);
}
