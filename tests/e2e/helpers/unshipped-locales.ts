import { CATALOG_LOCALES, isShipped } from '../../../src/i18n/config';

/**
 * Every language with a catalog that hasn't shipped, comma-separated, as
 * `E2E_UNSHIPPED_LOCALES` gives them to the e2e run's server
 * (playwright.config.ts): a signup or an account that stores one shows in it
 * there, and nothing else changes.
 */
export const UNSHIPPED_LOCALES = CATALOG_LOCALES.filter(
  (locale) => !isShipped('participant', locale) || !isShipped('organizer', locale),
).join(',');
