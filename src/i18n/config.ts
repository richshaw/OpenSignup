/**
 * Which languages OpenSignup has text in, and which are ready for whom.
 *
 * Pure on purpose: nothing from `next/*` and no `env.ts`, because the reminder
 * worker, static pages and tests import it too. The one thing it reads from
 * the environment is the e2e run's `E2E_UNSHIPPED_LOCALES` (`signupLocale`).
 */

/**
 * The languages with a catalog in `src/messages/`. A catalog may be partial:
 * the translator fills its gaps with English. Having a catalog doesn't make a
 * language one anybody gets or can choose: that's `SHIPPED`.
 */
export const CATALOG_LOCALES = ['en', 'sv'] as const;

export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

/**
 * The catalog namespaces (a catalog's top-level sections) each audience reads.
 * A language is complete for an audience when it has every English message in
 * these, which the catalog check in src/i18n/catalogs.test.ts enforces for
 * the languages in `SHIPPED`.
 */
export const AUDIENCE_NAMESPACES = {
  participant: ['participant', 'email', 'common'],
  organizer: ['organizer', 'auth', 'common'],
  site: ['site', 'common'],
} as const;

export type Audience = keyof typeof AUDIENCE_NAMESPACES;

/**
 * Per audience, the languages whose text for that audience is complete and has
 * been reviewed. Only these may be chosen or offered. A language launches for
 * participants and organizers together, so its launch adds it to both lists
 * in one change (a test fails while they differ). `site` waits for the pages
 * outside the app (phase 3).
 */
export const SHIPPED = {
  participant: ['en'],
  organizer: ['en'],
  site: ['en'],
} as const satisfies Record<Audience, readonly CatalogLocale[]>;

/** Whether `value` is a language shipped to `audience`, so one it may be offered. */
export function isShipped(audience: Audience, value: unknown): value is CatalogLocale {
  return (SHIPPED[audience] as readonly unknown[]).includes(value);
}

/**
 * Which step of `resolveLocale` chose a language, in the order they're tried:
 * the stored language, the instance's `DEFAULT_LOCALE`, or English.
 * `signup.created` records it, so don't rename the values.
 */
type LocaleSource = 'setting' | 'instance' | 'default';

/**
 * Which step chose a new signup's language: one of `resolveLocale`'s, or the
 * caller, which sent one (`api`). `signup.created` records it next to the
 * language.
 */
export type SignupLocaleSource = LocaleSource | 'api';

/**
 * The rule for which language anybody gets: `stored` once it has shipped to
 * `audience`, else `siteDefault` (the instance's `DEFAULT_LOCALE`) once that
 * has, else English. Every page, email and new signup takes its language by
 * this rule, through the functions in ./locale.ts, which pass what's stored
 * on the signup or the account and read the site default.
 *
 * `stored` is read leniently: a value that is unknown, or has a catalog but
 * hasn't shipped (or has since been taken off the list), is passed over
 * rather than breaking the row it's in. An operator who sets a site default
 * before it ships to an audience gets English there, not half-translated
 * pages. Nothing here reads the browser: a language is stored once, when an
 * account or a signup is created, and changed in Settings, never worked out
 * again on a visit.
 */
export function resolveLocale(
  audience: Audience,
  stored: unknown,
  siteDefault: CatalogLocale | undefined,
): { locale: CatalogLocale; source: LocaleSource } {
  if (isShipped(audience, stored)) return { locale: stored, source: 'setting' };
  if (isShipped(audience, siteDefault)) return { locale: siteDefault, source: 'instance' };
  return { locale: 'en', source: 'default' };
}

/**
 * The language for `audience` when nothing more specific applies: the
 * instance's `DEFAULT_LOCALE` when it has shipped to that audience, else
 * English. An operator who sets a language before it ships gets English pages
 * rather than half-translated ones.
 */
export function defaultFor(
  audience: Audience,
  instanceDefault: CatalogLocale | undefined,
): CatalogLocale {
  return resolveLocale(audience, undefined, instanceDefault).locale;
}

/**
 * The language a signup's participants get, from its stored
 * `settings.locale`: that language once it has shipped to participants, else
 * the instance's language for participants (`defaultFor`). Pass the signup's
 * stored value as it is, whatever it holds, and the instance's
 * `DEFAULT_LOCALE` (`instanceDefaultLocale()` in server.ts).
 *
 * The signup's page, the pages for changing a spot and unsubscribing, the
 * public signup API, its Settings tab and its emails (`emailLocale` in
 * src/email/commitment-row.ts) all read its language by this rule, so the
 * choice an organizer sees is the one participants get. A stored value is
 * lenient: one that is unknown, or has a catalog but hasn't shipped (or has
 * since been taken off the list), reads as the instance's language rather
 * than breaking the row it's in. The e2e run alone also keeps a stored
 * language that hasn't shipped (`isShownToTests`), which its emails follow
 * too: the confirmations its server sends, and the reminders and
 * time-changed emails of a worker started the same way.
 */
export function signupLocale(
  stored: unknown,
  instanceDefault: CatalogLocale | undefined,
): CatalogLocale {
  return isShownToTests(stored)
    ? stored
    : resolveLocale('participant', stored, instanceDefault).locale;
}

/**
 * The language an organizer's own screens are in, from the language stored
 * on their account: that language once it has shipped to organizers, else
 * the instance's language for organizers (`defaultFor`). It's
 * `chooseOrganizerLocale`'s rule for the `'organizer'` audience, with a
 * stored value read as leniently as `signupLocale` reads a signup's, and the
 * e2e run alone also keeps a stored language that hasn't shipped
 * (`isShownToTests`), so its specs can see the organizer app in one. Pass
 * the account's stored value as it is, and the instance's `DEFAULT_LOCALE`
 * (`instanceDefaultLocale()` in server.ts); code with the organizer's session
 * calls `getOrganizerAppLocale` in organizer.ts, which does both.
 */
export function organizerAppLocale(
  stored: unknown,
  instanceDefault: CatalogLocale | undefined,
): CatalogLocale {
  return isShownToTests(stored)
    ? stored
    : resolveLocale('organizer', stored, instanceDefault).locale;
}

/**
 * The `lang` for a part of a page whose words are in `part`'s language, inside
 * an element in `around`'s: `part` where the two differ, else undefined, which
 * React leaves out, so a part in the page's own language carries no mark. A
 * signup's own words (its title, and the message its share panel offers to
 * send) are in the signup's language (`signupLocale`) wherever the organizer
 * app shows them, inside screens in the organizer's.
 */
export function langWhereDifferent(
  part: CatalogLocale,
  around: CatalogLocale,
): CatalogLocale | undefined {
  return part === around ? undefined : part;
}

/**
 * Whether `stored` is a language with a catalog that the e2e run's server
 * shows, though it hasn't shipped, on a signup that stores it or on the
 * screens of an organizer whose account stores it (`organizerAppLocale`):
 * `E2E_UNSHIPPED_LOCALES`, a comma-separated list, which playwright.config.ts
 * sets for the server it starts. That's how the seeded Swedish signup
 * (tests/e2e/helpers/seed.ts) renders in Swedish before Swedish ships.
 *
 * Set on a real instance, it ships nothing. It only lets a signup or an
 * account keep a language already in its row, and nothing in the app can put
 * one there that hasn't shipped: `createSignup`, `updateSignup` and
 * `updateOrganizerLocale` refuse it from the browser, the API and the AI
 * connector alike, and new signups and accounts store none while only
 * English has shipped. It never makes a language the instance's
 * (`defaultFor`), a new signup's, or a choice anywhere. It isn't in env.ts,
 * because it isn't a setting, and the web server and the reminder worker
 * each log a warning when they start with it set (`warnIfUnshippedLocalesShown`
 * in ./unshipped-warning.ts).
 */
function isShownToTests(stored: unknown): stored is CatalogLocale {
  const listed = process.env.E2E_UNSHIPPED_LOCALES?.split(',') ?? [];
  return (
    typeof stored === 'string' &&
    listed.includes(stored) &&
    (CATALOG_LOCALES as readonly string[]).includes(stored)
  );
}

/**
 * A language as link previews name it (`og:locale`): language and region
 * joined by an underscore, the region being where the language is most likely
 * spoken, so 'en' is en_US and 'sv' is sv_SE.
 */
export function openGraphLocale(locale: CatalogLocale): string {
  const { language, region } = new Intl.Locale(locale).maximize();
  return region ? `${language}_${region}` : language;
}

/**
 * A language's name in that language, as a list to choose from shows it
 * (English, Svenska), so people can find theirs whatever language the rest of
 * the screen is in. Given `inLocale`, its name in that language instead, as
 * the Magic Compose prompt names one in English ("Swedish"). CLDR writes some
 * names in lower case (svenska, français), so the first letter is raised, by
 * the naming language's own rules.
 */
export function languageName(locale: CatalogLocale, inLocale: CatalogLocale = locale): string {
  const name = new Intl.DisplayNames([inLocale], { type: 'language' }).of(locale) ?? locale;
  return name.replace(/^\p{Ll}/u, (first) => first.toLocaleUpperCase(inLocale));
}
