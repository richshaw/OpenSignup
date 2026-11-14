/**
 * Which language an organizer gets, from what is known about them.
 *
 * Pure, like config.ts: the caller reads the organizer's saved language, the
 * instance default and the request's `Accept-Language` and passes them in.
 * Reading the request needs `next/headers`, which must stay out of this file
 * and out of server.ts, since the reminder worker imports server.ts under tsx.
 */
import { type Audience, type CatalogLocale, isShipped } from './config';

/**
 * Which step chose the language, in the order they are tried: the organizer's
 * own setting, the instance's `DEFAULT_LOCALE`, the browser, or English.
 */
export type OrganizerLocaleSource = 'setting' | 'instance' | 'browser' | 'default';

/**
 * Which step chose a new signup's language: the caller, which sent one
 * (`api`), the language its Magic Compose draft is written in (`content`,
 * `draftedSignupLocale` in organizer.ts), or one of the organizer's steps
 * (`getOrganizerLocale` there). `signup.created` records it next to the
 * language.
 */
export type SignupLocaleSource = OrganizerLocaleSource | 'api' | 'content';

/**
 * Whether `value` has the shape of a bare language code, as `signup.created`
 * records a Magic Compose draft's language (`draftLanguage`): two or three
 * letters a-z, a tag's primary language subtag in lower case (`sv`, `fil`).
 * The shape only: whether a code names a language is for the reader of the
 * AI's reply (`MagicComposeDraftSchema`) to decide.
 */
export function isLanguageCode(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z]{2,3}$/.test(value);
}

/**
 * The organizer's language for `audience`: the first of their saved language,
 * the instance default and their browser's top-ranked language that has
 * shipped to that audience, else English. A step whose language hasn't shipped
 * there is passed over, so a saved language that has since left `SHIPPED`
 * falls through to the next step instead of breaking anything.
 */
export function chooseOrganizerLocale({
  audience,
  saved,
  instanceDefault,
  acceptLanguage,
}: {
  /** Whose `SHIPPED` list each step is checked against. */
  audience: Audience;
  /** The language the organizer saved, if any. Read leniently, as stored. */
  saved: string | null;
  /** The instance's `DEFAULT_LOCALE` (`instanceDefaultLocale()`), or undefined when unset. */
  instanceDefault: CatalogLocale | undefined;
  /**
   * The request's `Accept-Language` header, or null when no browser is
   * involved: an AI assistant's header names its vendor's language, not the
   * organizer's, so MCP passes null.
   */
  acceptLanguage: string | null;
}): { locale: CatalogLocale; source: OrganizerLocaleSource } {
  if (isShipped(audience, saved)) return { locale: saved, source: 'setting' };
  if (isShipped(audience, instanceDefault)) return { locale: instanceDefault, source: 'instance' };
  const browser = acceptLanguage === null ? undefined : topRankedLanguage(acceptLanguage);
  if (isShipped(audience, browser)) return { locale: browser, source: 'browser' };
  return { locale: 'en', source: 'default' };
}

/** A language range (`sv`, `sv-SE`), capturing its language, or the wildcard. */
const RANGE = /^(?:([a-z]{1,8})(?:-[a-z\d]{1,8})*|\*)$/i;
/** A weight (RFC 9110 section 12.4.2): `q=` and a number from 0 to 1, up to three decimals. */
const WEIGHT = /^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i;

/**
 * The language of the browser's top-ranked range in an `Accept-Language`
 * header, in lower case and without its region (`sv-SE` gives `sv`, since
 * catalogs are named by language alone), or undefined when the top range is
 * the wildcard or nothing in the header can be read.
 *
 * Only the top range counts: ordinary negotiation would match `sv,en;q=0.8`
 * to English while Swedish hasn't shipped, though the organizer asked for
 * Swedish first. The highest weight wins, the first listed on a tie; a weight
 * of 0 means "not this one". An entry that isn't a range with at most a weight
 * after it is passed over, so junk in a header can't choose a language.
 */
function topRankedLanguage(header: string): string | undefined {
  let top: { language: string | undefined; weight: number } | undefined;
  for (const entry of header.split(',')) {
    const [range = '', ...params] = entry.split(';').map((part) => part.trim());
    const match = RANGE.exec(range);
    if (!match || params.length > 1) continue;
    const weight = params[0] === undefined ? 1 : Number(WEIGHT.exec(params[0])?.[1] ?? NaN);
    if (!(weight > (top?.weight ?? 0))) continue;
    // The wildcard ranks like any range, so one above every language means
    // the browser asks for no language in particular.
    top = { language: match[1]?.toLowerCase(), weight };
  }
  return top?.language;
}
