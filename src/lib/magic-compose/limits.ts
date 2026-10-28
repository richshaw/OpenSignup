/**
 * Magic Compose values the browser needs as well as the server. No imports, so
 * a client component can read them without pulling the server modules (or zod)
 * into the page's JavaScript.
 */

/**
 * The rate-limit bucket Magic Compose drafts count against. A copy of
 * `RateLimits.magicComposePerOrganizer.bucket`, which a test keeps equal, so
 * the shared rate-limit module needn't import from a feature.
 */
export const MAGIC_COMPOSE_BUCKET = 'magic.compose';

/**
 * `LLM_TIMEOUT_MS` when an instance leaves it unset: the server's budget for
 * one draft, retries included. The page reads the configured value, and falls
 * back to this one.
 */
export const LLM_TIMEOUT_DEFAULT_MS = 180_000;

/** How many options the model offers for "what do people sign up for?". */
export const WHAT_OPTIONS_MIN = 2;
export const WHAT_OPTIONS_MAX = 4;
export const WHAT_OPTION_MAX_LENGTH = 40;

/** What the organizer can send back for "what": picked options and their own items together. */
export const WHAT_ITEMS_MAX = 12;
export const WHAT_ITEM_MAX_LENGTH = 80;

/**
 * The earliest year "One day" takes. A copy of `MIN_DATE_YEAR` in
 * src/lib/reminder-fields.ts, which a test keeps equal: that module imports
 * the shared errors, and zod with them.
 */
export const EARLIEST_DATE_YEAR = 1900;

/** The "Several days" text box. */
export const WHEN_TEXT_MAX_LENGTH = 200;

/** The largest count "how many people do you need?" takes for one item. */
export const HOW_MANY_MAX = 9999;
