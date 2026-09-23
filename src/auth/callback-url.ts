/** Request header the organizer middleware sets for post-login deep links. */
export const ORGANIZER_CALLBACK_HEADER = 'x-opensignup-callback-url';

/**
 * Only same-site paths may be used as a post-login destination. Blocks
 * protocol-relative (`//evil`) and backslash tricks; anything doubtful falls
 * back to the dashboard.
 */
export function safeCallbackUrl(raw: string | undefined | null): string {
  if (!raw) return '/app';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/app';
  return raw;
}
