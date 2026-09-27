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
 * `router.replace()` on one is the same.
 *
 * The origin check only says the input stayed put; what the browser gets is
 * the path the parser wrote back, and the parse rewrites it (dot segments go,
 * `\` becomes `/`, an authority naming the sentinel host is absorbed). So
 * `/.//evil.example` and `//callback.invalid//evil.example` both resolve on
 * the sentinel origin with a pathname of `//evil.example`, which the browser
 * reads as another host. The returned path is checked too: an `https:`
 * pathname always starts with `/` and never holds a backslash, tab, LF or CR,
 * so a leading `//` is the one way it can leave the site.
 *
 * A repeated query key reaches a page as an array, so a non-string falls back.
 */
export function safeCallbackUrl(raw: string | string[] | undefined | null): string {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return DEFAULT_CALLBACK;
  let resolved: URL;
  try {
    resolved = new URL(raw, SENTINEL_ORIGIN);
  } catch {
    return DEFAULT_CALLBACK;
  }
  if (resolved.origin !== SENTINEL_ORIGIN || resolved.pathname.startsWith('//')) {
    return DEFAULT_CALLBACK;
  }
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
