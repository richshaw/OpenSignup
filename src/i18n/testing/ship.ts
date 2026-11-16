import { onTestFinished } from 'vitest';
import { type Audience, SHIPPED } from '../config';

/** Every audience's list as the app ships it, from before any test changed one. */
const asShippedToday = { ...SHIPPED };

/**
 * Ships `locales` to `audience` for one test, for tests that need a language
 * that hasn't shipped yet, like Swedish.
 *
 * It changes `SHIPPED` itself, which is what the app's own checks
 * (`isShipped`, `signupLocale`, `chooseOrganizerLocale`) read, and puts every
 * audience's list back once the test finishes, whether it passed or threw, so
 * no test sees another's languages. Call it in a test, or in a `beforeEach`
 * for every test in a block; outside a test, vitest refuses it.
 *
 * `locales` takes any string, since a language can be shipped here before it
 * has a catalog (`CATALOG_LOCALES`).
 */
export function ship(audience: Audience, locales: readonly string[]): void {
  onTestFinished(restoreShipped);
  (SHIPPED as Record<Audience, readonly string[]>)[audience] = locales;
}

function restoreShipped(): void {
  Object.assign(SHIPPED, asShippedToday);
}
