/**
 * How long an organizer's sign-in lasts without being used. Auth.js renews the
 * session (and its cookie) at most once a day while it's used, so this is an
 * idle limit, not a hard one. The cookies page prints it, so keep it here
 * rather than inline in `config.ts`.
 */
export const SESSION_MAX_AGE_DAYS = 30;

export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60;
