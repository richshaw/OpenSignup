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
 * been reviewed. Only these may be chosen or offered, so adding one here is
 * that language's launch.
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
 * The language for `audience` when nothing more specific applies: the
 * instance's `DEFAULT_LOCALE` when it has shipped to that audience, else
 * English. An operator who sets a language before it ships gets English pages
 * rather than half-translated ones.
 */
export function defaultFor(
  audience: Audience,
  instanceDefault: CatalogLocale | undefined,
): CatalogLocale {
  return isShipped(audience, instanceDefault) ? instanceDefault : 'en';
}

/**
 * The language a signup's participants get, from its stored
 * `settings.locale`: that language once it has shipped to participants, else
 * the instance's language for participants (`defaultFor`). Pass the signup's
 * stored value as it is, whatever it holds, and the instance's
 * `DEFAULT_LOCALE` (`instanceDefaultLocale()` in server.ts).
 *
 * The signup's page, the pages for changing a spot and unsubscribing, the
 * public signup API and its Settings tab all read its language by this rule,
 * so the choice an organizer sees is the one participants get. Its emails
 * don't follow it yet. A stored value is
 * lenient: one that is unknown, or has a catalog but hasn't shipped (or has
 * since been taken off the list), reads as the instance's language rather than
 * breaking the row it's in. The e2e run's server alone also keeps a stored
 * language that hasn't shipped (`isShownToTests`).
 */
export function signupLocale(
  stored: unknown,
  instanceDefault: CatalogLocale | undefined,
): CatalogLocale {
  return isShipped('participant', stored) || isShownToTests(stored)
    ? stored
    : defaultFor('participant', instanceDefault);
}

/**
 * Whether `stored` is a language with a catalog that the e2e run's server
 * shows on a signup that stores it, though it hasn't shipped:
 * `E2E_UNSHIPPED_LOCALES`, a comma-separated list, which playwright.config.ts
 * sets for the server it starts. That's how the seeded Swedish signup
 * (tests/e2e/helpers/seed.ts) renders in Swedish before Swedish ships.
 *
 * Set on a real instance, it ships nothing. It only lets a signup keep a
 * language already in its row, and nothing in the app can put one there that
 * hasn't shipped: `createSignup` and `updateSignup` refuse it from the
 * browser, the API and the AI connector alike, and new signups store none
 * while only English has shipped. It never makes a language the instance's
 * (`defaultFor`), an organizer's, or a choice anywhere. It isn't in env.ts,
 * because it isn't a setting, and the server logs a warning when it starts
 * with it set (src/instrumentation.ts).
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
 * the screen is in. CLDR writes some names in lower case (svenska, français),
 * so the first letter is raised, by that language's own rules.
 */
export function languageName(locale: CatalogLocale): string {
  const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
  return name.replace(/^\p{Ll}/u, (first) => first.toLocaleUpperCase(locale));
}
