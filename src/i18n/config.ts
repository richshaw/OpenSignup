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
 * Per audience, the languages whose text for that audience is complete and has
 * been reviewed. Only these may be chosen or offered, so adding one here is
 * that language's launch.
 *
 * An audience reads these catalog namespaces: participants `participant`,
 * `email` and `common`; organizers `organizer`, `auth` and `common`; the
 * public site `site` and `common`.
 */
export const SHIPPED = {
  participant: ['en'],
  organizer: ['en'],
  site: ['en'],
} as const satisfies Record<string, readonly CatalogLocale[]>;

/**
 * The time zone every translator formats dates in. Slot dates and times are
 * wall-clock values with no zone of their own, so formatting them in the
 * server's or the browser's zone could move them to another day.
 */
export const TIME_ZONE = 'UTC';
