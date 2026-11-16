/**
 * An organizer's language, for server code that has their session, and the
 * language of the pages before sign-in, for one who isn't signed in yet. It reads
 * the instance's `DEFAULT_LOCALE` through server.ts, so it's server-only, but
 * it needs nothing from Next: the language comes from what's stored on the
 * organizer's account, never from the request, so a page, a server action and
 * an AI assistant's request all get the same one. server.ts, which the
 * reminder worker imports, keeps nothing about organizers.
 */
import type { OrganizerSession } from '@/auth/organizer-session';
import { type Audience, resolveLocale } from './config';
import { localeOfOrganizer } from './locale';
import { instanceDefaultLocale } from './server';

export { newSignupLocale, signInLocale } from './locale';

/** `localeOfOrganizer` in ./locale.ts, under its old name. */
export function getOrganizerAppLocale(session: Pick<OrganizerSession, 'locale'> | null) {
  return localeOfOrganizer(session);
}

/** `resolveLocale` for the organizer's stored language. */
export function getOrganizerLocale(session: Pick<OrganizerSession, 'locale'>, audience: Audience) {
  return resolveLocale(audience, session.locale, instanceDefaultLocale());
}
