/**
 * Which language an organizer gets, from what is known about them.
 *
 * Pure, like config.ts: the caller reads the instance default and either the
 * organizer's stored language or a new account's `Accept-Language`, and
 * passes them in. Reading the request needs `next/headers`, which must stay
 * out of this file and out of server.ts, since the reminder worker imports
 * server.ts under tsx.
 */
import { type CatalogLocale, isShipped } from './config';

/**
 * The language a new organizer account stores, or null to store none. The
 * owner's rule (14 November 2026), where the site default wins:
 *
 * - The instance sets `DEFAULT_LOCALE`: none, so the account follows it.
 * - Otherwise the browser's top-ranked language, from the `Accept-Language`
 *   of the request that creates the account, when it has shipped to
 *   participants and isn't English, which an account with none gets anyway.
 * - In every other case (no header, one that can't be read, a language that
 *   hasn't shipped, English) none.
 *
 * So a stored language is always one the account wouldn't otherwise get, and
 * an operator who sets or changes `DEFAULT_LOCALE` later moves every account
 * that stores none. While only English has shipped, nothing is stored. The
 * decision table in docs/translating.md ("An organizer's language") is this
 * rule, and the tests run every row of it.
 */
export function newOrganizerLocale({
  acceptLanguage,
  instanceDefault,
}: {
  /** The request's `Accept-Language` header, or null when it has none. */
  acceptLanguage: string | null;
  /** The instance's `DEFAULT_LOCALE` (`instanceDefaultLocale()`), or undefined when unset. */
  instanceDefault: CatalogLocale | undefined;
}): CatalogLocale | null {
  if (instanceDefault !== undefined || acceptLanguage === null) return null;
  const top = topRankedLanguage(acceptLanguage);
  return top !== 'en' && isShipped('participant', top) ? top : null;
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
 * Only the top range counts: an account stores the language its browser asks
 * for first, or none, never one further down that ordinary negotiation would
 * fall back on. A browser that asks first for a language that hasn't shipped,
 * then a shipped one, stores nothing. The highest weight wins, the first
 * listed on a tie; a weight of 0 means "not this one". An entry that isn't a
 * range with at most a weight after it is passed over, so junk in a header
 * can't choose a language.
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
