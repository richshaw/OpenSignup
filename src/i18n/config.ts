/**
 * Which languages OpenSignup has text in, and which are ready for whom.
 *
 * Pure on purpose: nothing from `next/*` and no `env.ts`, because the reminder
 * worker, static pages and tests import it too.
 */

/**
 * The languages with a catalog in `src/messages/`. A catalog may be partial:
 * the translator fills its gaps with English.
 */
export const CATALOG_LOCALES = ['en'] as const;

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
 * The signup's page, the public signup API and its Settings tab all read its
 * language by this rule, so the choice an organizer sees is the one
 * participants get. Its emails don't follow it yet. A stored value is
 * lenient: one that is unknown, or has a catalog but hasn't shipped (or has
 * since been taken off the list), reads as the instance's language rather than
 * breaking the row it's in.
 */
export function signupLocale(
  stored: unknown,
  instanceDefault: CatalogLocale | undefined,
): CatalogLocale {
  return isShipped('participant', stored) ? stored : defaultFor('participant', instanceDefault);
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
