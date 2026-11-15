/**
 * Turning a slot's field values into the label a person sees.
 *
 * Lives in `src/lib` because both the participant page and the outgoing emails
 * need it, and they must agree: a slot called "Front Desk Shift" on the page
 * has to be "Front Desk Shift" in the reminder too. `slots.ref` is not a
 * substitute — it is a slugified, collision-suffixed key
 * (`front-desk-shift-2026-08-30`, `cookies-2`), fine as an identifier and
 * wrong in front of a participant.
 */

import { TIME_ZONE } from '@/i18n/time-zone';
import { isBlankSlotValue } from '@/lib/blank-slot-value';
import { isRealDate, isRealTime } from '@/lib/reminder-fields';

/** The shape both `SlotFieldDefinition` and the view's field type satisfy. */
export interface LabelledField {
  ref: string;
  label: string;
  fieldType: string;
}

/*
 * The formatters below take the reader's language as `locale`, a language tag
 * like 'en' or 'sv'. Slot dates and times are wall-clock values with no zone
 * of their own, so each is built from its parts as a UTC moment and formatted
 * in UTC (`TIME_ZONE`): neither the server's zone nor the browser's can move
 * it to another day or hour.
 */

/**
 * A `date` field's stored YYYY-MM-DD as people read it: "Sat, Apr 25" in
 * English, "lör 3 maj" in Swedish. Null for anything else, a day that doesn't
 * exist (Feb 31) included: a stored value always has that shape, and parsing
 * any other string with `new Date()` would read a half-typed "Sat, Nov 14" as
 * a day in 2001, in whatever zone the code runs in.
 */
export function formatSlotDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso || !isRealDate(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: TIME_ZONE,
  }).format(Date.UTC(year, month - 1, day));
}

/**
 * A `time` field's stored 24-hour HH:MM as people read it. Each language gets
 * its own short time from `Intl` ("18:30" in Swedish), except English, which
 * keeps the 12-hour clock it has always had ("18:30" → "6:30 PM") written out
 * here: which space `Intl` puts before PM depends on the runtime's ICU (Node's
 * is a narrow U+202F), so a page could read differently on the server and in
 * the browser. Ours is a no-break space, so a narrow column never strands "PM".
 */
export function formatSlotTime(hhmm: string | null | undefined, locale: string): string | null {
  if (!hhmm || !isRealTime(hhmm)) return null;
  const hour = Number(hhmm.slice(0, 2));
  if (locale === 'en') {
    const period = hour < 12 ? 'AM' : 'PM';
    return `${hour % 12 || 12}:${hhmm.slice(3)}\u00a0${period}`;
  }
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: TIME_ZONE }).format(
    Date.UTC(1970, 0, 1, hour, Number(hhmm.slice(3))),
  );
}

/**
 * Returns the first field in definition order, skipping the group field.
 * Returns null if every field is the group field (or there are no fields).
 */
export function pickPrimaryField<F extends LabelledField>(
  fields: readonly F[],
  groupRef?: string | null,
): F | null {
  for (const f of fields) {
    if (f.ref === groupRef) continue;
    return f;
  }
  return null;
}

export function renderFieldValue(
  field: LabelledField,
  raw: unknown,
  locale: string,
): string | null {
  if (isBlankSlotValue(raw)) return null;
  // A value the formatter can't read, like a half-typed "Sat, Nov 14" in a
  // date field, shows as it was typed.
  if (field.fieldType === 'date') {
    const formatted = formatSlotDate(String(raw), locale);
    if (formatted) return formatted;
  }
  if (field.fieldType === 'time') {
    const formatted = formatSlotTime(String(raw), locale);
    if (formatted) return formatted;
  }
  return String(raw);
}

/** One printable `Label: value` line from a slot's field values. */
export interface SlotDetail {
  label: string;
  value: string;
}

/**
 * Every field the organizer defined that this slot has a value for, in
 * definition order, ready to print as `Label: value`.
 *
 * Deliberately singles out nothing. The emails used to name one "primary"
 * field as a "What:" line and derive a separate "When:" line from
 * `slots.slot_at`, which guessed wrong the moment that primary field *was* the
 * date or time: a signup grouped by date sent "What: 13:00" above "When:
 * Wednesday, September 9 at 1:00 PM", and dropped every other field the
 * organizer had asked about. Printing all of them needs no rule to get right.
 *
 * The values are rendered exactly as the public page renders them
 * (`renderFieldValue`), so a slot reads the same in the inbox as on the page.
 */
export function slotDetails(
  fields: readonly LabelledField[],
  values: Record<string, unknown>,
  locale: string,
): SlotDetail[] {
  const out: SlotDetail[] = [];
  for (const field of fields) {
    const value = renderFieldValue(field, values[field.ref], locale);
    if (value === null) continue;
    out.push({ label: field.label, value });
  }
  return out;
}
