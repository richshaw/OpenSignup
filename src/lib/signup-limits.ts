/**
 * Organizer-facing signup limits, kept import-free so client components under
 * /app/signups/[id] can read them without pulling zod (and the rest of
 * `@/schemas/signups`) into their bundle. Mirrors `participant-limits.ts`.
 */
export const TITLE_MIN_LENGTH = 2;
export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 2000;

/** What the server and the Build tab both say when a title is too short. */
export const TITLE_TOO_SHORT_MESSAGE = `Title must be at least ${TITLE_MIN_LENGTH} characters.`;
