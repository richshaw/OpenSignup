/**
 * An organizer's language, for server code that has their session. It reads
 * the instance's `DEFAULT_LOCALE` through server.ts, so it's server-only. The
 * caller passes the request's `Accept-Language` (from `next/headers` on a page
 * or in a server action), or null when no browser is involved, as with an AI
 * assistant. So this file needs nothing from Next, and server.ts, which the
 * reminder worker imports, keeps nothing about organizers.
 */
import type { OrganizerSession } from '@/auth/organizer-session';
import { type Audience, SHIPPED } from './config';
import { chooseOrganizerLocale, type OrganizerLocaleSource } from './organizer-locale';
import { instanceDefaultLocale } from './server';

/**
 * The organizer's language for `audience`, and which step chose it: their
 * saved language, the instance's `DEFAULT_LOCALE`, their browser's top-ranked
 * language, or English, taking the first that has shipped to `audience`
 * (`chooseOrganizerLocale`). Pass `'participant'` for the language their new
 * signups start in.
 */
export function getOrganizerLocale(
  session: Pick<OrganizerSession, 'locale'>,
  acceptLanguage: string | null,
  audience: Audience,
) {
  return chooseOrganizerLocale({
    audience,
    saved: session.locale,
    instanceDefault: instanceDefaultLocale(),
    acceptLanguage,
  });
}

/**
 * Which step chose a new signup's language: the caller, which sent one
 * (`api`), or one of the organizer's steps (`getOrganizerLocale`).
 * `signup.created` records it next to the language.
 */
export type SignupLocaleSource = OrganizerLocaleSource | 'api';

/**
 * The language a new signup starts in when its creator sent none: the
 * organizer's language for participants, and the step that chose it. Null
 * while only one language has shipped to participants, so the signup stores
 * none: no signup is pinned to a language nobody had a choice of, and it
 * reads as the instance's language (`resolveLocale`) until it has one. A
 * language the caller sent isn't this function's to decide: it goes into the
 * signup as sent, `createSignup` refuses it unless it has shipped, and its
 * source is `api`.
 */
export function newSignupLocale(
  session: Pick<OrganizerSession, 'locale'>,
  acceptLanguage: string | null,
) {
  if (SHIPPED.participant.length < 2) return null;
  return getOrganizerLocale(session, acceptLanguage, 'participant');
}
