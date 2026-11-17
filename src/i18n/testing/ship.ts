import { onTestFinished } from 'vitest';
import { type Audience, SHIPPED } from '../config';

/** Every audience's list as the app ships it, from before any test changed one. */
const asShippedToday = { ...SHIPPED };

/**
 * Ships `locales` to `audience` for one test, for tests that need a language
 * shipped to an audience it hasn't shipped to, or taken from one it has.
 *
 * It changes `SHIPPED` itself, which is what the app's own checks
 * (`isShipped`, `resolveLocale` and the functions in ../locale.ts) read,
 * and puts every audience's list back once the test finishes, whether it
 * passed or threw, so no test sees another's languages. Call it in a test,
 * or in a `beforeEach` for every test in a block; outside a test, vitest
 * refuses it.
 *
 * `locales` takes any string, since a language can be shipped here before it
 * has a catalog (`CATALOG_LOCALES`).
 */
export function ship(audience: Audience, locales: readonly string[]): void {
  onTestFinished(restoreShipped);
  (SHIPPED as Record<Audience, readonly string[]>)[audience] = locales;
}

/**
 * Starts a test from before any launch: English alone, shipped to every
 * audience. For tests of what a language gets before it ships (or if it's
 * ever withdrawn), and of one audience's list against another's: they state
 * the lists they start from rather than lean on today's, so they pass before
 * and after each launch. A test's own `ship` calls stack on top. Call it as
 * `ship` is called: `beforeEach(shipOnlyEnglish)`, or in a test.
 */
export function shipOnlyEnglish(): void {
  for (const audience of Object.keys(SHIPPED) as Audience[]) ship(audience, ['en']);
}

function restoreShipped(): void {
  Object.assign(SHIPPED, asShippedToday);
}
