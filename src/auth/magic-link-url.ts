// `trustHost: true` makes NextAuth derive the magic-link origin from the
// request's Host header, which on Fly.io can be the internal `*.fly.dev`
// hostname rather than the public domain. Re-anchor the URL to AUTH_URL
// (the canonical origin) before sending — path/query/hash are preserved.
export function canonicalizeMagicLinkUrl(rawUrl: string, authUrl: string): string {
  const canonical = new URL(authUrl);
  const link = new URL(rawUrl);
  link.protocol = canonical.protocol;
  link.host = canonical.host;
  return link.toString();
}

// Wrap the Auth.js callback URL in a /login/confirm page so that corporate
// email security scanners (Mimecast, Proofpoint, etc.) that pre-click links
// don't consume the token. The actual callback URL is passed as `next` and
// only visited when the user clicks the "Sign in" button on that page.
export function buildConfirmationUrl(callbackUrl: string, authUrl: string): string {
  const base = new URL(authUrl);
  const confirm = new URL('/login/confirm', base);
  confirm.searchParams.set('next', callbackUrl);
  return confirm.toString();
}
