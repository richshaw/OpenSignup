import {
  CATALOG_LOCALES,
  type CatalogLocale,
  isShipped,
  languageName,
  openGraphLocale,
} from '../config';

/** A language the tests check a translation in: any with a catalog but English. */
export type TestLocale = Exclude<CatalogLocale, 'en'>;

/**
 * The languages the tests check translations in: every language with a
 * catalog (`CATALOG_LOCALES`) but English, in that list's order. A language
 * joins these by getting its catalog, and with it the e2e specs on a signup
 * in it (tests/e2e/translated-signup.spec.ts and the specs beside it), its
 * translation screenshots and email samples, and the layout checks: nothing
 * else is written for it (docs/translating.md, "Adding a language").
 */
export const TEST_LOCALES: readonly TestLocale[] = CATALOG_LOCALES.filter(
  (locale): locale is TestLocale => locale !== 'en',
);

/**
 * The test languages that haven't shipped to participants, so a signup shows
 * in one only on a server started with them in `E2E_UNSHIPPED_LOCALES`
 * (`signupLocale` in ../config.ts). playwright.config.ts gives the list to the
 * server it starts, and leaves the variable unset once every language has
 * shipped.
 */
export const UNSHIPPED_TEST_LOCALES: readonly TestLocale[] = TEST_LOCALES.filter(
  (locale) => !isShipped('participant', locale),
);

/**
 * One test language, the first, for a unit test of something that works the
 * same in every language but English: that a signup's page is marked with its
 * language, say, or that an unshipped language is refused. A test that checks
 * what a language's text says checks it in the language it's about.
 */
export const OTHER_LOCALE: TestLocale = (() => {
  const [first] = TEST_LOCALES;
  if (!first) {
    throw new Error(
      'The tests need a language besides English: CATALOG_LOCALES in src/i18n/config.ts has none.',
    );
  }
  return first;
})();

/** A language's name in English, for a test's title: "Swedish". */
export function englishName(locale: CatalogLocale): string {
  return languageName(locale, 'en');
}

/** `OTHER_LOCALE`'s name in English. */
export const OTHER_LANGUAGE = englishName(OTHER_LOCALE);

/**
 * A language with the region where it's most spoken, as a browser or an
 * `Accept-Language` header names it: "sv-SE" for Swedish.
 */
export function withRegion(locale: CatalogLocale): string {
  return openGraphLocale(locale).replace('_', '-');
}
