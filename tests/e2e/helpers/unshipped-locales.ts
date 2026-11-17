import { CATALOG_LOCALES, type CatalogLocale, isShipped } from '../../../src/i18n/config';

/**
 * Every language with a catalog that hasn't shipped, comma-separated, as
 * `E2E_UNSHIPPED_LOCALES` gives them to the e2e run's server
 * (playwright.config.ts): a signup or an account that stores one shows in it
 * there, and nothing else changes. Empty while every one has shipped.
 */
export const UNSHIPPED_LOCALES = CATALOG_LOCALES.filter(
  (locale) => !isShipped('participant', locale) || !isShipped('organizer', locale),
).join(',');

/**
 * What a check says when a page that should be in `locale`, stored on a row
 * by the test, isn't. For a language that hasn't shipped: how to start a
 * server that shows it, which playwright.config.ts does for its own, but a
 * `pnpm dev` it reuses may not. A language that has shipped needs nothing,
 * so for one of those it says so, and the fault is the page's.
 */
export function unshippedHint(locale: CatalogLocale): string {
  return UNSHIPPED_LOCALES.split(',').includes(locale)
    ? `start the server with E2E_UNSHIPPED_LOCALES=${UNSHIPPED_LOCALES}`
    : `${locale} has shipped, so the server shows it with no E2E_UNSHIPPED_LOCALES`;
}
