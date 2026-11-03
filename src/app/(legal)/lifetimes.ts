import { LOGIN_CODE_MAX_AGE_MS } from '@/auth/login-code-lifetime';
import { formatDuration } from '@/lib/format-duration';
import { SLOT_CHANGE_SETTLE_MINUTES } from '@/lib/reminder-eligibility';
import { DAYS_AFTER_SLOT, MAX_DAYS, MIN_DAYS } from '@/lib/returning-participant';
import { OAUTH_TTL } from '@/oauth/config';

/**
 * The durations the privacy and cookies pages state, in words, built from the
 * constants that decide them so the pages can't go on saying an old number.
 * Everything imported here is safe at build time: the legal pages are static.
 */

const fromSeconds = (seconds: number) => formatDuration(Math.floor(seconds / 60));
const days = (n: number) => formatDuration(n * 24 * 60);

/** How long the six-digit sign-in code can be used. */
export const LOGIN_CODE_LIFETIME = formatDuration(Math.floor(LOGIN_CODE_MAX_AGE_MS / 60_000));

/** The `os_commit` cookie's floor, its slot allowance and the browser's ceiling. */
export const COMMIT_COOKIE_MIN = days(MIN_DAYS);
export const COMMIT_COOKIE_AFTER_SLOT = DAYS_AFTER_SLOT === 7 ? 'a week' : days(DAYS_AFTER_SLOT);
export const COMMIT_COOKIE_MAX = days(MAX_DAYS);

/** How long after the organizer's last move a moved-slot email goes out. */
export const SLOT_CHANGE_DELAY = formatDuration(SLOT_CHANGE_SETTLE_MINUTES);

/** How long an access token outlives a disconnect, and the longest an approval lasts. */
export const ACCESS_TOKEN_LIFETIME = fromSeconds(OAUTH_TTL.ACCESS_TOKEN);
export const GRANT_LIFETIME = fromSeconds(OAUTH_TTL.GRANT_MAX);

/** `os_oauth_session`, in hours as the page has always said ("24 hours", not "1 day"). */
const sessionHours = OAUTH_TTL.SESSION / 3600;
export const OAUTH_SESSION_LIFETIME =
  Number.isInteger(sessionHours) && sessionHours > 1
    ? `${sessionHours} hours`
    : fromSeconds(OAUTH_TTL.SESSION);

/** `os_oauth_interaction` and `os_oauth_resume`: oidc-provider gives both the interaction TTL. */
export const OAUTH_INTERACTION_LIFETIME = fromSeconds(OAUTH_TTL.INTERACTION);
