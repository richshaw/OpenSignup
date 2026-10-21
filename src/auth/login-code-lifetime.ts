/**
 * A code never outlives this, whatever the link's own expiry: the per-email
 * attempt budget (5 per 15 minutes, `RateLimits.loginCodePerEmail`) is only a
 * meaningful bound on guessing if the code is gone when the window resets.
 * Fifteen minutes covers "I asked for it and I'm sitting here"; after that the
 * link still works.
 *
 * Kept free of database and env imports so the email template can read it.
 */
export const LOGIN_CODE_MAX_AGE_MS = 15 * 60 * 1000;

/** The code expires at the earlier of the link expiry and its maximum age. */
export function loginCodeExpiry(linkExpiresAt: Date, now = new Date()): Date {
  return new Date(Math.min(linkExpiresAt.getTime(), now.getTime() + LOGIN_CODE_MAX_AGE_MS));
}
