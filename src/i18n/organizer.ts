/**
 * An organizer's language, for server code that has their session. It reads
 * the instance's `DEFAULT_LOCALE` through server.ts, so it's server-only, but
 * it needs nothing from Next: the language comes from what's stored on the
 * organizer's account, never from the request, so a page, a server action and
 * an AI assistant's request all get the same one. server.ts, which the
 * reminder worker imports, keeps nothing about organizers.
 */
import type { OrganizerSession } from '@/auth/organizer-session';
import { type Audience, SHIPPED } from './config';
import { chooseOrganizerLocale } from './organizer-locale';
import { instanceDefaultLocale } from './server';

/**
 * The organizer's language for `audience`, and which step chose it: the
 * language stored on their account, the instance's `DEFAULT_LOCALE`, or
 * English, taking the first that has shipped to `audience`
 * (`chooseOrganizerLocale`). Pass `'participant'` for the language their new
 * signups start in.
 */
export function getOrganizerLocale(session: Pick<OrganizerSession, 'locale'>, audience: Audience) {
  return chooseOrganizerLocale({
    audience,
    saved: session.locale,
    instanceDefault: instanceDefaultLocale(),
  });
}

/**
 * The language a new signup starts in when its creator sent none: the
 * organizer's language for participants, and the step that chose it. Null
 * while only one language has shipped to participants, so the signup stores
 * none: no signup is pinned to a language nobody had a choice of, and it
 * reads as the instance's language (`signupLocale`) until it has one. A
 * language the caller sent isn't this function's to decide: it goes into the
 * signup as sent, `createSignup` refuses it unless it has shipped, and its
 * source is `api`.
 */
export function newSignupLocale(session: Pick<OrganizerSession, 'locale'>) {
  if (SHIPPED.participant.length < 2) return null;
  return getOrganizerLocale(session, 'participant');
}
