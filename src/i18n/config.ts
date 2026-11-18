/**
 * Which languages OpenSignup has text in, and which are ready for whom.
 *
 * Pure on purpose: nothing from `next/*`, no `env.ts` and nothing else from
 * the environment, because the reminder worker, static pages, client code and
 * tests import it too.
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
  participant: ['en', 'sv'],
  organizer: ['en', 'sv'],
  site: ['en'],
} as const satisfies Record<Audience, readonly CatalogLocale[]>;

/** Whether `value` is a language shipped to `audience`, so one it may be offered. */
export function isShipped(audience: Audience, value: unknown): value is CatalogLocale {
  return (SHIPPED[audience] as readonly unknown[]).includes(value);
}

/**
 * Which step of `resolveLocale` chose a language, in the order they're tried:
 * the stored language, the instance's `DEFAULT_LOCALE`, or English.
 * `signup.created` records it next to a new signup's language, or `api` when
 * the caller sent one (`createSignup`), so don't rename the values.
 */
type LocaleSource = 'setting' | 'instance' | 'default';

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
 * The `lang` for a part of a page whose words are in `part`'s language, inside
 * an element in `around`'s: `part` where the two differ, else undefined, which
 * React leaves out, so a part in the page's own language carries no mark. A
 * signup's own words (its title, and the message its share panel offers to
 * send) are in the signup's language (`localeOfSignup` in ./locale.ts)
 * wherever the organizer app shows them, inside screens in the organizer's.
 */
export function langWhereDifferent(
  part: CatalogLocale,
  around: CatalogLocale,
): CatalogLocale | undefined {
  return part === around ? undefined : part;
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

/** CLDR's name for `locale` in `inLocale`, as `Intl.DisplayNames` gives it, case and all. */
function cldrLanguageName(locale: CatalogLocale, inLocale: CatalogLocale): string {
  return new Intl.DisplayNames([inLocale], { type: 'language' }).of(locale) ?? locale;
}

/** `name` with its first letter raised, by `locale`'s rules. */
function capitalized(name: string, locale: CatalogLocale): string {
  return name.replace(/^\p{Ll}/u, (first) => first.toLocaleUpperCase(locale));
}

/**
 * A language's name in that language, as a list to choose from shows it
 * (English, Svenska), so people can find theirs whatever language the rest of
 * the screen is in. Given `inLocale`, its name in that language instead, as
 * the Magic Compose prompt names one in English ("Swedish"). CLDR writes some
 * names in lower case (svenska, français), so the first letter is raised, by
 * the naming language's own rules. Inside a sentence, use
 * `languageNameInSentence`.
 */
export function languageName(locale: CatalogLocale, inLocale: CatalogLocale = locale): string {
  return capitalized(cldrLanguageName(locale, inLocale), inLocale);
}

/**
 * A language's name in that language, as it reads inside a sentence in
 * `sentenceLocale`: "Switch them to Svenska", "Byt dem till svenska". The name
 * stays in its own language, as in a list; its first letter follows the
 * sentence's. A language that writes its own name in lower case (svenska,
 * français, suomi) writes language names in lower case in running text, so
 * the name keeps CLDR's case ("svenska", and "English", which English
 * capitalizes). One that capitalizes its own (English, Deutsch) raises the
 * first letter, as a list does. So the rule comes from CLDR, with no table,
 * and a new language needs no code.
 */
export function languageNameInSentence(
  locale: CatalogLocale,
  sentenceLocale: CatalogLocale,
): string {
  const name = cldrLanguageName(locale, locale);
  return /^\p{Lu}/u.test(cldrLanguageName(sentenceLocale, sentenceLocale))
    ? capitalized(name, locale)
    : name;
}
