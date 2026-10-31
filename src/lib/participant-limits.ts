/**
 * Participant-facing input limits, kept import-free so the client pages
 * under /s/[slug] can read them without pulling zod into their bundle.
 */
export const NAME_MAX_LENGTH = 100;
export const NOTES_MAX_LENGTH = 500;
export const QUANTITY_MAX = 999;
