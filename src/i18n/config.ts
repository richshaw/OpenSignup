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

function hasCatalog(value: unknown): value is CatalogLocale {
  return (CATALOG_LOCALES as readonly unknown[]).includes(value);
}

/**
 * The language a stored value means, such as a signup's `settings.locale`: the
 * value when it names a catalog, else `fallback`. Stored languages are lenient
 * (one that is unknown, or whose catalog has gone, must not break the row it is
 * in), so whatever reads one reads it through this.
 */
export function resolveLocale(value: unknown, fallback: CatalogLocale): CatalogLocale {
  return hasCatalog(value) ? value : fallback;
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
