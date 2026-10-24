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
