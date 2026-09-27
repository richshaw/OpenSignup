/** Request header the organizer middleware sets for post-login deep links. */
export const ORGANIZER_CALLBACK_HEADER = 'x-opensignup-callback-url';

const DEFAULT_CALLBACK = '/app';

/**
 * Origin a candidate is resolved against. Nothing is ever fetched from it — it
 * only has to be an origin no real destination can sit on, so that "the parse
 * stayed put" and "the parse escaped to another host" are distinguishable.
 * `.invalid` is reserved by RFC 2606 and never resolves.
 */
const SENTINEL_ORIGIN = 'https://callback.invalid';

/**
 * Only same-site paths may be used as a post-login destination; anything
 * doubtful falls back to the dashboard.
 *
 * Resolved with the URL parser rather than checked as a string, because a
 * string check sees a different value than the browser does: the URL spec
 * removes every ASCII tab, LF and CR before parsing, so `/<tab>/evil.example`
 * starts with a single slash here and arrives as the protocol-relative
 * `//evil.example` there. Node passes a tab through in a `Location` header
 * verbatim, so `redirect()` on such a path was an open redirect, and
 * `router.replace()` on one is the same. Parsing against an origin nothing can
 * be on catches that by construction, along with the `//` and backslash forms
 * and whatever else the parser folds — the same shape `/login/confirm` already
 * uses to vet its `next`.
 */
export function safeCallbackUrl(raw: string | undefined | null): string {
  if (!raw || !raw.startsWith('/')) return DEFAULT_CALLBACK;
  let resolved: URL;
  try {
    resolved = new URL(raw, SENTINEL_ORIGIN);
  } catch {
    return DEFAULT_CALLBACK;
  }
  if (resolved.origin !== SENTINEL_ORIGIN) return DEFAULT_CALLBACK;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
