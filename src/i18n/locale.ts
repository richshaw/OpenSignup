/**
 * Which language a signup, an organizer, or a page nobody is signed in on
 * gets, for server code: one rule (`resolveLocale` in ./config.ts) with the
 * instance's `DEFAULT_LOCALE` read for it. The language comes from what's
 * stored on the signup or the organizer's account, never from the request,
 * so a page, a server action, an email and an AI assistant's request all get
 * the same one.
 *
 * Server-only, since it reads the environment through ./server.ts, but
 * nothing from `next/*` and only a type from the session module, so the
 * reminder worker can import it. Keep these functions out of server.ts:
 * tests replace that module with a partial mock (`instanceDefaultLocale`
 * alone), and a mock doesn't reach calls made inside the module it replaces,
 * so from here they pick the mock up.
 */
import type { OrganizerSession } from '@/auth/organizer-session';
import {
  type Audience,
  type CatalogLocale,
  CATALOG_LOCALES,
  SHIPPED,
  resolveLocale,
} from './config';
import { instanceDefaultLocale } from './server';

/**
 * The language of a signup's pages, its emails and its own words wherever
 * they show (its title, its slots, its share message): the language stored
 * on it (`signup.settings.locale`, passed as it is, whatever it holds), else
 * the instance's `DEFAULT_LOCALE`, else English, each only once it has
 * shipped to participants. Everything that shows a signup's language reads it
 * here, its Settings tab included, so the choice an organizer sees is the one
 * participants get. The e2e run alone also keeps a stored language that
 * hasn't shipped (`keptForTests`), which its emails follow too: the
 * confirmations its server sends, and the reminders and time-changed emails
 * of a worker started the same way.
 */
export function localeOfSignup(stored: unknown): CatalogLocale {
  return shown('participant', stored);
}

/**
 * The language of an organizer's own screens: the language stored on their
 * account, else the instance's `DEFAULT_LOCALE`, else English, each only once
 * it has shipped to organizers. Anything that shows an organizer their own
 * text takes its language from here (CLAUDE.md's table says what asks which
 * function), the sign-in email too, through `signInEmailLocale`, which reads
 * the account at its address.
 *
 * Each page calls it with the session it already has, rather than taking a
 * language from a layout above it: a client-side navigation re-renders the
 * page but not the layout, as `requireOrganizerSession` explains. It costs
 * no statement, since the session has read the stored language already.
 * With no session (a tab title worked out for a visitor the page will send
 * to sign in), it's the language of an account with none stored. The e2e run
 * alone also keeps a stored language that hasn't shipped (`keptForTests`),
 * so its specs can see the organizer app in one.
 */
export function localeOfOrganizer(session: Pick<OrganizerSession, 'locale'> | null): CatalogLocale {
  return shown('organizer', session?.locale ?? null);
}

/**
 * The language of the pages nobody is signed in on, the sign-in pages and
 * the OAuth provider's error pages among them: the provider doesn't know who
 * is signed in (the consent screen, which does, is in `localeOfOrganizer`).
 * There's no stored language to read, and nothing is worked out from the
 * request (no header, no cookie): it's the language an account with none
 * stored gets, the instance's `DEFAULT_LOCALE` once that has shipped to
 * organizers, else English. The e2e run's unshipped languages don't change
 * it, since they only keep a language already stored on a row.
 */
export function signInLocale(): CatalogLocale {
  return localeOfOrganizer(null);
}

/**
 * The language a new signup stores when its creator sent none, and which
 * step chose it: the organizer's stored language, else the instance's
 * `DEFAULT_LOCALE`, else English, each only once it has shipped to
 * participants. Null while only one language has shipped to participants, so
 * the signup stores none: no signup is pinned to a language nobody had a
 * choice of, and it reads as the instance's language (`localeOfSignup`) until
 * it has one. A language the caller sent isn't this function's to decide: it
 * goes into the signup as sent, `createSignup` refuses it unless it has
 * shipped, and its source is `api`.
 *
 * Unlike `localeOfOrganizer`, it never keeps the e2e run's unshipped
 * languages: those may be shown, never stored, and `createSignup` would
 * refuse one.
 */
export function newSignupLocale(session: Pick<OrganizerSession, 'locale'>) {
  if (!offersLanguageChoice()) return null;
  return resolveLocale('participant', session.locale, instanceDefaultLocale());
}

/**
 * Whether an organizer gets a choice of language for their signups: only
 * once more than one language has shipped to participants. Account Settings
 * (through `newSignupLocale`) and a signup's Settings tab both ask here, so
 * they offer the choice together. Reads `SHIPPED` on each call, since tests
 * change it at runtime.
 */
export function offersLanguageChoice(): boolean {
  return SHIPPED.participant.length > 1;
}

/**
 * The rule, plus the e2e run's one exception. For showing only: nothing that
 * stores a language calls this.
 */
function shown(audience: Audience, stored: unknown): CatalogLocale {
  return keptForTests(stored)
    ? stored
    : resolveLocale(audience, stored, instanceDefaultLocale()).locale;
}

/**
 * Whether `stored` is a language with a catalog that the e2e run's server
 * shows, though it hasn't shipped, on a signup that stores it or on the
 * screens of an organizer whose account stores it: `E2E_UNSHIPPED_LOCALES`, a
 * comma-separated list, which playwright.config.ts sets for the server it
 * starts. That's how each seeded test signup (tests/e2e/helpers/seed.ts)
 * renders in its language before that language ships.
 *
 * Set on a real instance, it ships nothing. It only lets a signup or an
 * account keep a language already in its row, and nothing in the app can put
 * one there that hasn't shipped: `createSignup`, `updateSignup` and
 * `updateOrganizerLocale` refuse it from the browser, the API and the AI
 * connector alike, and new signups and accounts store none while only
 * English has shipped. It never makes a language the instance's, a new
 * signup's (`newSignupLocale`), or a choice anywhere. It isn't in env.ts,
 * because it isn't a setting, and the web server and the reminder worker
 * each log a warning when they start with it set (`warnIfUnshippedLocalesShown`
 * in ./unshipped-warning.ts). A test in ./locale.test.ts fails if any other
 * module reads it.
 */
function keptForTests(stored: unknown): stored is CatalogLocale {
  const listed = process.env.E2E_UNSHIPPED_LOCALES?.split(',') ?? [];
  return (
    typeof stored === 'string' &&
    listed.includes(stored) &&
    (CATALOG_LOCALES as readonly string[]).includes(stored)
  );
}
