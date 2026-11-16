/**
 * An organizer's language, for server code that has their session. It reads
 * the instance's `DEFAULT_LOCALE` through server.ts, so it's server-only, but
 * it needs nothing from Next: the language comes from what's stored on the
 * organizer's account, never from the request, so a page, a server action and
 * an AI assistant's request all get the same one. server.ts, which the
 * reminder worker imports, keeps nothing about organizers.
 */
import type { OrganizerSession } from '@/auth/organizer-session';
import { type Audience, type CatalogLocale, SHIPPED, organizerAppLocale } from './config';
import { chooseOrganizerLocale } from './organizer-locale';
import { instanceDefaultLocale } from './server';

/**
 * The language the organizer app shows this organizer: the language stored
 * on their account, else the instance's `DEFAULT_LOCALE`, else English, each
 * only once it has shipped to organizers (`organizerAppLocale`). Every
 * organizer page, and anything else that shows an organizer their own text,
 * takes its language from here: the strip and notice on a signup's page, the
 * Preview banner, the header and the pages under it.
 *
 * Each page calls it with the session it already has, rather than taking a
 * language from a layout above it: a client-side navigation re-renders the
 * page but not the layout, as `requireOrganizerSession` explains. It costs
 * no statement, since the session has read the stored language already.
 * With no session (a tab title worked out for a visitor the page will send
 * to sign in), it's the language of an account with none stored.
 */
export function getOrganizerAppLocale(
  session: Pick<OrganizerSession, 'locale'> | null,
): CatalogLocale {
  return organizerAppLocale(session?.locale ?? null, instanceDefaultLocale());
}

/**
 * The organizer's language for `audience`, and which step chose it: the
 * language stored on their account, the instance's `DEFAULT_LOCALE`, or
 * English, taking the first that has shipped to `audience`
 * (`chooseOrganizerLocale`). Pass `'participant'` for the language their new
 * signups start in. For the language of the organizer's own screens, call
 * `getOrganizerAppLocale`, which also keeps the e2e run's unshipped
 * languages.
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
