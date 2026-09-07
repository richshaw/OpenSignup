import type { SlotFieldDefinition } from '@/schemas/slot-fields';

/**
 * Which field gives a slot its instant (`slots.slot_at`) — and so its calendar
 * export, its position in date order and its reminder timing.
 *
 * Pure so the build page can apply the same rule the services do when it
 * mirrors a field change locally. Anything that touches the database stays in
 * src/services/slot-fields.ts.
 */

/** The three things anchor resolution reads; both SlotFieldDefinition and the build page's GridField have them. */
export type AnchorCandidate = Pick<SlotFieldDefinition, 'ref' | 'fieldType' | 'sortOrder'>;

export interface ReminderFields {
  dateField: SlotFieldDefinition | null;
  timeField: SlotFieldDefinition | null;
}

/**
 * Canonical field order, so resolution never depends on how the caller sorted.
 * The ref tiebreak is a plain code-point comparison (refs are lowercase kebab),
 * the same order migration 0005 gets from `COLLATE "C"`.
 */
function byOrder(a: AnchorCandidate, b: AnchorCandidate): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
}

/**
 * The date field a signup should anchor on when it has not chosen one: the
 * first by (sortOrder, ref), or null when it has no date field at all.
 */
export function pickAnchorRef(fields: readonly AnchorCandidate[]): string | null {
  const [first] = fields.filter((f) => f.fieldType === 'date').sort(byOrder);
  return first?.ref ?? null;
}

/**
 * The anchor a signup should carry after a field change: the current ref while
 * it still names one of `fields`' date fields, otherwise the first date field,
 * or null when none is left. An organizer's choice survives every change that
 * leaves its field a date field.
 */
export function resolveAnchorRef(
  settings: { reminderFromFieldRef?: string | undefined },
  fields: readonly AnchorCandidate[],
): string | null {
  const current = settings.reminderFromFieldRef;
  if (current && fields.some((f) => f.fieldType === 'date' && f.ref === current)) return current;
  return pickAnchorRef(fields);
}

/**
 * The time field paired with `dateField`, or null when the signup has none.
 *
 * Paired rather than picked globally: a signup with depart/return dates and
 * depart/return times used to take the lowest-sorted time whatever date won, so
 * a return date could be stamped with a departure time and the participant got
 * a reminder that was confidently wrong. Preferring the first time field that
 * sorts *after* the chosen date matches how organizers lay columns out — the
 * time belonging to a date sits beside it. Falls back to the first time field
 * so a signup that puts its only time column first still resolves.
 */
function pairedTimeField(
  dateField: SlotFieldDefinition | null,
  fields: SlotFieldDefinition[],
): SlotFieldDefinition | null {
  const timeFields = fields.filter((f) => f.fieldType === 'time').sort(byOrder);
  if (timeFields.length === 0) return null;
  if (!dateField) return timeFields[0] ?? null;
  return timeFields.find((f) => byOrder(f, dateField) > 0) ?? timeFields[0] ?? null;
}

/**
 * Resolves the fields a slot's instant is built from.
 *
 * The date field is exactly the one `settings.reminderFromFieldRef` names, with
 * no guessing: the services keep that ref pointing at a real date field and
 * `updateSignup` refuses any other value, so a null here means the signup has
 * no date field, not that resolution gave up. Guessing used to live here —
 * "the only date field" — and it hid a hole: two date fields with no choice
 * made resolved to nothing, and reminders stopped for the whole signup with
 * nothing said to anyone.
 */
export function findReminderFields(
  settings: { reminderFromFieldRef?: string | undefined; [k: string]: unknown },
  fields: SlotFieldDefinition[],
): ReminderFields {
  const ref = settings.reminderFromFieldRef;
  const dateField = ref
    ? (fields.find((f) => f.fieldType === 'date' && f.ref === ref) ?? null)
    : null;
  return { dateField, timeField: pairedTimeField(dateField, fields) };
}
