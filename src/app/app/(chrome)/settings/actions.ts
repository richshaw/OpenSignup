'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { getDb } from '@/db/client';
import { newSignupLocale } from '@/i18n/locale';
import { refusalAsResult } from '@/lib/errors';
import { updateOrganizerLocale } from '@/services/organizers';
import { setOpenSignupsLocale } from '@/services/signups';

const SETTINGS_PATH = '/app/settings';

/** Every organizer page under the header, which all show the account's language. */
const ORGANIZER_APP = '/app';

/**
 * Account Settings' "Language", there once a second language has shipped to
 * participants: the organizer app's language, and the one new signups start
 * in. Saves the signed-in organizer's own language: the form names no
 * organizer, so it can't change anyone else's. The service refuses a language
 * that hasn't shipped, and a form with no choice in it, and the page shows
 * the refusal by its code. Either way it comes back to Account Settings, with
 * `saved=language` when it saved.
 */
export async function setOrganizerLocaleAction(formData: FormData) {
  const session = await requireOrganizerSession();
  const result = await refusalAsResult(() =>
    updateOrganizerLocale(getDb(), toActor(session), formData.get('locale')),
  );
  if (!result.ok) redirect(`${SETTINGS_PATH}?error=${result.error.code}`);
  // The whole organizer app, its header included: it's all in this language.
  revalidatePath(ORGANIZER_APP, 'layout');
  redirect(`${SETTINGS_PATH}?saved=language`);
}

/**
 * Account Settings' "Switch your 3 open signups to Svenska". Puts the
 * signed-in organizer's open signups (`setOpenSignupsLocale` says which count)
 * in the language the page offers: theirs for new signups, worked out here as
 * the page does (`newSignupLocale`). It reads nothing from the form, which
 * sends nothing, so a forged one can't name another language, or anyone
 * else's signups. While only one language has shipped to participants the
 * page offers no button, and a forged press does nothing: there's no choice,
 * so nothing to switch.
 *
 * Comes back with `switched=1`, a flag: the page then says how many open
 * signups use the language, from what's stored, once none is left in another
 * one. A press that finds none left changes nothing and stays where it is: so
 * the second tap of a double tap, which waits for the first, leaves the first
 * one's answer on the page. A refusal comes back by its code, as above.
 */
export async function switchOpenSignupsLocaleAction(_form: FormData) {
  const session = await requireOrganizerSession();
  const mine = newSignupLocale(session);
  if (!mine) return;
  const result = await refusalAsResult(() =>
    setOpenSignupsLocale(getDb(), toActor(session), mine.locale),
  );
  if (!result.ok) redirect(`${SETTINGS_PATH}?error=${result.error.code}`);
  const { signupIds } = result.value;
  for (const signupId of signupIds) {
    revalidatePath(`/app/signups/${signupId}`, 'layout');
  }
  revalidatePath(SETTINGS_PATH);
  if (signupIds.length > 0) redirect(`${SETTINGS_PATH}?switched=1`);
}
