import { MIN_DATE_YEAR } from '@/lib/reminder-fields';
import { FIELD_TYPES, type FieldType } from '@/schemas/slot-fields';

/**
 * Prose the model reads in tool descriptions. Kept in one place so
 * create_signup, add_field, add_slots and update_field say the same about who
 * fills a field in and describe the same field types and value formats; the
 * JSON Schema already says what the shapes are, this says what the shapes
 * cannot.
 */

const DATE_VALUES = `ISO dates like 2026-10-03, in ${MIN_DATE_YEAR} or later`;
const TIME_VALUES = 'HH:MM';

/** How slot values are keyed and what an omitted or null capacity means. */
export const SLOT_VALUES_GUIDE =
  'Slot values are keyed by field ref. capacity null means unlimited; omitted means 1.';

/** How a slot's value is written for each field type, for tools that take slot values. */
export const SLOT_VALUE_FORMATS = `dates as ${DATE_VALUES}, times as ${TIME_VALUES}, numbers as numbers, enums as one of the choices`;

export const FIELD_GUIDE = `Fields are columns the organizer fills in to describe each slot, such as its date or the item to bring; participants do not fill them in. Everyone who signs up gives their name and can leave a note, and gives an email unless the signup makes it optional, so the signup already records who took each slot. Field types: text, date (values are ${DATE_VALUES}), time (values are ${TIME_VALUES}), number (values are numbers, not strings), enum (give choices; values must be one of them). ${SLOT_VALUES_GUIDE}`;

/**
 * One example config per field type. A Record, so a new field type is a type
 * error here until it has one. number's unit and target are left out on
 * purpose: the schema accepts them but nothing reads or shows them.
 */
const CONFIG_EXAMPLES: Record<FieldType, string> = {
  text: '{ fieldType: "text", maxLength }',
  date: '{ fieldType: "date" }',
  time: '{ fieldType: "time" }',
  number: '{ fieldType: "number" }',
  enum: '{ fieldType: "enum", choices: [...] }',
};

/** Every field type with the config it takes, in FIELD_TYPES order. */
export const FIELD_CONFIGS_GUIDE = FIELD_TYPES.map((t) => `${t} ${CONFIG_EXAMPLES[t]}`).join(', ');
