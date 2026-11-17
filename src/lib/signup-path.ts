/**
 * Request header `src/middleware.ts` sets on every public signup path
 * (`/s/...`): the path, so pages there that get no params (the not-found
 * pages) can find the signup they're under. It is a header of its own, never
 * the organizer callback header, so nothing on these paths can choose where
 * sign-in sends someone. It holds the path alone, never the query, which on
 * an edit link is its token. The middleware `set`s it, so a value a client
 * sends is replaced.
 *
 * No imports: the middleware bundle takes this file, and it must stay small
 * and free of server-only code.
 */
export const SIGNUP_PATH_HEADER = 'x-opensignup-signup-path';

/** What `toSlug` (src/lib/slug.ts) makes: lower-case letters, digits and hyphens. */
const SLUG = /^[a-z0-9-]+$/;

/**
 * The slug in a public signup path (`/s/<slug>`, `/s/<slug>/c/<id>`), or null
 * for anything else. The header is request input like any other, so a segment
 * no signup could have as its slug (empty, percent-encoded, other characters)
 * gives null rather than a lookup.
 */
export function slugFromSignupPath(path: string | null): string | null {
  const [root, s, slug] = path?.split('/') ?? [];
  if (root !== '' || s !== 's' || slug === undefined) return null;
  return SLUG.test(slug) ? slug : null;
}
