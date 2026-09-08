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

/** The shape both `SlotFieldDefinition` and the view's field type satisfy. */
export interface LabelledField {
  ref: string;
  label: string;
  fieldType: string;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatSlotDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  // `date`-type slot fields are validated as YYYY-MM-DD. `new Date('YYYY-MM-DD')`
  // parses as UTC midnight and would shift to the prior calendar day in
  // negative-offset zones — construct a local-midnight Date instead so the
  // displayed weekday/day matches what the organizer typed.
  const dateOnly = iso.match(DATE_ONLY);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
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

export function renderFieldValue(field: LabelledField, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (field.fieldType === 'date') {
    const formatted = formatSlotDate(String(raw));
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
): SlotDetail[] {
  const out: SlotDetail[] = [];
  for (const field of fields) {
    const value = renderFieldValue(field, values[field.ref]);
    if (value === null) continue;
    out.push({ label: field.label, value });
  }
  return out;
}
