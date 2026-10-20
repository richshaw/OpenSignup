import { MIN_DATE_YEAR } from '@/lib/reminder-fields';

/**
 * Prose the model reads in tool descriptions. Kept in one place so
 * create_signup and add_field say the same about who fills a field in and
 * describe the same field types and value formats; the JSON Schema already
 * says what the shapes are, this says what the shapes cannot.
 */
export const FIELD_GUIDE = `Fields are columns the organizer fills in to describe each slot, such as its date or the item to bring; participants do not fill them in. Everyone who signs up gives their name and can leave a note, and gives an email unless the signup makes it optional, so the signup already records who took each slot. Field types: text, date (values are ISO dates like 2026-10-03, in ${MIN_DATE_YEAR} or later), time (values are HH:MM), number (values are numbers, not strings), enum (give choices; values must be one of them). Slot values are keyed by field ref. capacity null means unlimited; omitted means 1.`;
