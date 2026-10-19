import { serviceError, type ServiceError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';

/**
 * Which field gives a slot its instant (`slots.slot_at`) — and so its calendar
 * export, its position in date order and its reminder timing.
 *
 * Pure so the build page can apply the same rule the services do when it
 * mirrors a field change locally, and so the signup page's view module can ask
 * `slotTimeOfDay` without importing a service. Anything that touches the
 * database stays in src/services/slot-fields.ts.
 */

/** The three things anchor resolution reads; both SlotFieldDefinition and the build page's BuildField have them. */
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
  return isDateRef(fields, current) ? current : pickAnchorRef(fields);
}

function isDateRef(fields: readonly AnchorCandidate[], ref: unknown): ref is string {
  return fields.some((f) => f.fieldType === 'date' && f.ref === ref);
}

/**
 * The anchor a signup should carry after a settings write: the ref the caller
 * asked for, which must name one of `fields`' date fields, or, with nothing
 * asked for, `resolveAnchorRef` applied to the current one. Creating and
 * updating a signup both go through here, so they refuse the same refs with
 * the same error.
 */
export function chooseAnchorRef(
  requested: string | undefined,
  current: string | undefined,
  fields: readonly AnchorCandidate[],
): Result<string | null, ServiceError> {
  if (requested === undefined) {
    return ok(resolveAnchorRef({ reminderFromFieldRef: current }, fields));
  }
  if (isDateRef(fields, requested)) return ok(requested);
  return err(
    serviceError(
      'invalid_input',
      "reminderFromFieldRef must name one of the signup's date fields",
      {
        field: 'settings.reminderFromFieldRef',
        received: requested,
      },
    ),
  );
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

/**
 * The earliest year a date field's values take (`isRealDate` below). No signup is for a day before it, and earlier
 * years break things downstream: Postgres has no year 0 and refuses it as a
 * timestamptz, so a slot dated 0000 failed its save or a later `slot_at`
 * rebuild; the driver reads a stored year below 100 back a century late (0099
 * as 1999); and the calendar export writes a year below 1000 with fewer than
 * four digits, which RFC 5545 does not allow. The builder's date input and
 * the MCP field guide name it too. Here rather than in src/schemas, so the
 * public page can check a date without loading zod.
 */
export const MIN_DATE_YEAR = 1900;

/**
 * A YYYY-MM-DD string naming a day that exists, in any year.
 *
 * The shape regex alone accepts 2026-13-45 and 2026-02-30, which reach
 * `new Date()` as an Invalid Date (or, for 02-30, silently roll into March).
 * Checking the parts round-trip rejects both.
 */
export function isCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Not `Date.UTC(y, …)`: it reads years 0–99 as 1900–1999, so 0099-12-31
  // would fail the round trip and be called impossible rather than too early.
  // setUTCFullYear takes the year as written.
  const at = new Date(0);
  at.setUTCFullYear(y, mo - 1, d);
  return at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d;
}

/**
 * A value a date field takes: a YYYY-MM-DD day that exists, in
 * `MIN_DATE_YEAR` or later. Magic Compose blanks a drafted date that fails it,
 * since `createSignup` would otherwise refuse the whole draft over one cell.
 */
export function isRealDate(value: string): boolean {
  return isCalendarDate(value) && Number(value.slice(0, 4)) >= MIN_DATE_YEAR;
}

/** An HH:MM string naming a time that exists. The shape regex accepts 99:99. */
export function isRealTime(value: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

/**
 * The slot's own time-of-day, or null when the signup has no time field or the
 * slot leaves it blank.
 *
 * Split out so callers can tell a date-only slot from one with a real time.
 * The stored instant cannot: `extractSlotAt` anchors a date-only slot at
 * `12:00:00`, which is byte-for-byte what a genuine `12:00` produces.
 */
export function slotTimeOfDay(
  settings: { reminderFromFieldRef?: string | undefined; [k: string]: unknown },
  fields: SlotFieldDefinition[],
  values: Record<string, unknown>,
): string | null {
  const { timeField } = findReminderFields(settings, fields);
  const timeVal = timeField ? values[timeField.ref] : undefined;
  return typeof timeVal === 'string' && isRealTime(timeVal) ? timeVal : null;
}
