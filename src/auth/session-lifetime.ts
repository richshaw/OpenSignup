/**
 * How long an organizer's sign-in lasts, counted from when they signed in.
 * Auth.js pushes the session row's expiry forward at most once a day while it's
 * used, but the app reads the session through `auth()` in server components and
 * actions, where Auth.js cannot rewrite the cookie, so the browser keeps the
 * expiry it got at sign-in. The cookies page prints this, so keep it here
 * rather than inline in `config.ts`.
 */
export const SESSION_MAX_AGE_DAYS = 30;

export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60;
