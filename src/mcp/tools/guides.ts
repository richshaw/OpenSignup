/**
 * Prose the model reads in tool descriptions. Kept in one place so
 * create_signup and add_field describe the same field types and value
 * formats; the JSON Schema already says what the shapes are, this says what
 * the shapes cannot.
 */
export const FIELD_GUIDE =
  'Field types: text, date (values are ISO dates like 2026-10-03), time (values are HH:MM), number (values are numbers, not strings), enum (give choices; values must be one of them). Slot values are keyed by field ref. capacity null means unlimited; omitted means 1.';
