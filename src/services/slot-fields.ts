import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db, Queryable } from '@/db/client';
import { signups } from '@/db/schema/signups';
import { slotFields } from '@/db/schema/slot-fields';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';
import { serviceError, type ServiceError } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import { parseInputSafe } from '@/lib/parse';
import {
  requireOrganizerId,
  requireWorkspaceAccess,
  requireWorkspaceWrite,
  type Actor,
} from '@/lib/policy';
import { err, ok, type Result } from '@/lib/result';
import {
  type SlotFieldConfig,
  type SlotFieldDefinition,
  SlotFieldInputSchema,
  SlotFieldUpdateInputSchema,
} from '@/schemas/slot-fields';

type FieldRow = typeof slotFields.$inferSelect;

function rowToDefinition(row: FieldRow): SlotFieldDefinition {
  return {
    id: row.id,
    ref: row.ref,
    label: row.label,
    fieldType: row.fieldType as SlotFieldDefinition['fieldType'],
    sortOrder: row.sortOrder,
    config: row.config as SlotFieldConfig,
  };
}

export async function listFieldsForSignup(
  db: Queryable,
  signupId: string,
): Promise<SlotFieldDefinition[]> {
  const rows = await db
    .select()
    .from(slotFields)
    .where(eq(slotFields.signupId, signupId))
    .orderBy(asc(slotFields.sortOrder), asc(slotFields.createdAt));
  return rows.map(rowToDefinition);
}

interface ReminderSettingsLike {
  reminderFromFieldRef?: string | undefined;
  [k: string]: unknown;
}

/**
 * The slot's own time-of-day, or null when the signup has no time field or the
 * slot leaves it blank.
 *
 * Split out so callers can tell a genuine midnight slot from a date-only one.
 * The stored instant cannot: `extractSlotAt` defaults a missing time to
 * `00:00:00`, which is byte-for-byte what a real `00:00` produces.
 */
export function slotTimeOfDay(
  settings: ReminderSettingsLike,
  fields: SlotFieldDefinition[],
  values: Record<string, unknown>,
): string | null {
  const { timeField } = findReminderFields(settings, fields);
  const timeVal = timeField ? values[timeField.ref] : undefined;
  return typeof timeVal === 'string' && isRealTime(timeVal) ? timeVal : null;
}

export function extractSlotAt(
  settings: ReminderSettingsLike,
  fields: SlotFieldDefinition[],
  values: Record<string, unknown>,
): Date | null {
  const { dateField } = findReminderFields(settings, fields);
  if (!dateField) return null;
  const dateVal = values[dateField.ref];
  if (typeof dateVal !== 'string' || !isRealDate(dateVal)) return null;
  const timeOfDay = slotTimeOfDay(settings, fields, values);
  const at = new Date(`${dateVal}T${timeOfDay ? `${timeOfDay}:00` : '00:00:00'}.000Z`);
  // An unparseable instant is null, never an Invalid Date. A NaN date is not
  // equal to itself, so recomputeSlotAtForSignup's change check never matches
  // and it would rewrite that row on every single pass, forever.
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Re-derive slots.slot_at for every slot in a signup. Safe to call inside a tx. */
export async function recomputeSlotAtForSignup(
  tx: Queryable,
  signupId: string,
): Promise<{ updated: number }> {
  const signupRow = await tx
    .select({ settings: signups.settings })
    .from(signups)
    .where(eq(signups.id, signupId))
    .limit(1)
    .then((r) => r[0]);
  if (!signupRow) return { updated: 0 };
  const settings = (signupRow.settings as ReminderSettingsLike) ?? {};
  const fields = await listFieldsForSignup(tx, signupId);
  const slotRows = await tx
    .select({ id: slots.id, values: slots.values, slotAt: slots.slotAt })
    .from(slots)
    .where(eq(slots.signupId, signupId));

  let updated = 0;
  for (const row of slotRows) {
    const next = extractSlotAt(settings, fields, (row.values as Record<string, unknown>) ?? {});
    const cur = row.slotAt;
    const same =
      (next === null && cur === null) ||
      (next instanceof Date && cur instanceof Date && next.getTime() === cur.getTime());
    if (same) continue;
    await tx.update(slots).set({ slotAt: next }).where(eq(slots.id, row.id));
    updated++;
  }
  return { updated };
}

export async function addField(
  db: Db,
  actor: Actor,
  signupId: string,
  rawInput: unknown,
): Promise<Result<SlotFieldDefinition, ServiceError>> {
  const input = parseInputSafe(SlotFieldInputSchema, rawInput);
  if (!input.ok) return input;
  const data = input.value;

  const signupRow = await db
    .select()
    .from(signups)
    .where(eq(signups.id, signupId))
    .limit(1)
    .then((r) => r[0]);
  if (!signupRow) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceWrite(actor, signupRow.workspaceId);

  const existing = await db
    .select({ id: slotFields.id })
    .from(slotFields)
    .where(and(eq(slotFields.signupId, signupId), eq(slotFields.ref, data.ref)))
    .limit(1);
  if (existing.length > 0) {
    return err(
      serviceError('conflict', `field ref "${data.ref}" already exists`, {
        field: 'ref',
        received: data.ref,
      }),
    );
  }

  const id = makeId('fld');
  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(slotFields)
      .values({
        id,
        signupId,
        workspaceId: signupRow.workspaceId,
        ref: data.ref,
        label: data.label,
        fieldType: data.fieldType,
        sortOrder: data.sortOrder,
        config: data.config,
      })
      .returning();
    if (!row) throw new Error('field insert failed');

    // slot_at is a cache of (anchor field, slot values). Adding a date field
    // can move the anchor — a new date sorting before the current one takes
    // over — so the cache has to be rebuilt here. Without this, slots created
    // before the change keep a stale slot_at and go on reminding, while
    // anything created or edited afterwards resolves differently: one signup
    // where whether you get a reminder depends on edit order.
    await recomputeSlotAtForSignup(tx, signupId);

    await recordActivity(tx, {
      signupId,
      workspaceId: signupRow.workspaceId,
      actor: { actorId: requireOrganizerId(actor), actorType: 'organizer' },
      eventType: 'field.created',
      payload: { fieldId: row.id, ref: row.ref, fieldType: row.fieldType },
    });
    return row;
  });

  return ok(rowToDefinition(inserted));
}

export async function updateField(
  db: Db,
  actor: Actor,
  fieldId: string,
  rawInput: unknown,
): Promise<Result<SlotFieldDefinition, ServiceError>> {
  const input = parseInputSafe(SlotFieldUpdateInputSchema, rawInput);
  if (!input.ok) return input;
  const data = input.value;

  const existing = await db
    .select()
    .from(slotFields)
    .where(eq(slotFields.id, fieldId))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) return err(serviceError('not_found', 'field not found'));
  requireWorkspaceWrite(actor, existing.workspaceId);

  if (data.fieldType !== undefined && data.config === undefined) {
    return err(serviceError('invalid_input', 'fieldType change requires matching config'));
  }
  if (data.config !== undefined) {
    const nextType = data.fieldType ?? existing.fieldType;
    if (data.config.fieldType !== nextType) {
      return err(serviceError('invalid_input', 'config.fieldType must match the field type'));
    }
  }

  const slotRows = await db
    .select({ id: slots.id, values: slots.values })
    .from(slots)
    .where(eq(slots.signupId, existing.signupId));

  const nextDef: SlotFieldDefinition = {
    id: existing.id,
    ref: existing.ref,
    label: data.label ?? existing.label,
    fieldType: (data.fieldType ?? existing.fieldType) as SlotFieldDefinition['fieldType'],
    sortOrder: data.sortOrder ?? existing.sortOrder,
    config: (data.config ?? (existing.config as SlotFieldConfig)) as SlotFieldConfig,
  };

  const offending: string[] = [];
  for (const row of slotRows) {
    const values = (row.values as Record<string, unknown>) ?? {};
    const r = validateOneValue(nextDef, values[existing.ref]);
    if (!r.ok) offending.push(row.id);
  }
  if (offending.length > 0) {
    return err(
      serviceError('conflict', 'change would invalidate existing slot values', {
        details: { slotIds: offending.slice(0, 20), count: offending.length },
      }),
    );
  }

  // Retyping the anchor field away from `date` leaves reminderFromFieldRef
  // pointing at something that is no longer a date. findReminderFields treats
  // that as "no anchor" and deliberately does not fall back, so reminders would
  // stop for the whole signup with nothing said. deleteField already clears the
  // ref for the same reason; this is the other way to stop being a date.
  const stopsBeingDate =
    existing.fieldType === 'date' && data.fieldType !== undefined && data.fieldType !== 'date';
  const signupSettingsRow = await db
    .select({ settings: signups.settings })
    .from(signups)
    .where(eq(signups.id, existing.signupId))
    .limit(1)
    .then((r) => r[0]);
  const priorSettings =
    (signupSettingsRow?.settings as { reminderFromFieldRef?: string; [k: string]: unknown }) ?? {};
  const clearsReminderRef = stopsBeingDate && priorSettings.reminderFromFieldRef === existing.ref;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(slotFields)
      .set({
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.fieldType !== undefined ? { fieldType: data.fieldType } : {}),
        ...(data.config !== undefined ? { config: data.config } : {}),
      })
      .where(eq(slotFields.id, fieldId))
      .returning();
    if (!row) throw new Error('field update returned nothing');

    if (clearsReminderRef) {
      const { reminderFromFieldRef: _dropped, ...nextSettings } = priorSettings;
      await tx
        .update(signups)
        .set({ settings: nextSettings, updatedAt: new Date() })
        .where(eq(signups.id, existing.signupId));
    }

    // A type change, a reorder, or a relabel can all move which field the
    // anchor resolves to, so rebuild the cache rather than trying to predict
    // when it matters. No-ops when nothing actually changed.
    await recomputeSlotAtForSignup(tx, existing.signupId);

    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      changes[key] = data[key];
    }
    await recordActivity(tx, {
      signupId: existing.signupId,
      workspaceId: existing.workspaceId,
      actor: { actorId: requireOrganizerId(actor), actorType: 'organizer' },
      eventType: 'field.updated',
      payload: {
        fieldId: row.id,
        ref: row.ref,
        changes,
        ...(clearsReminderRef ? { clearedReminderFromFieldRef: true } : {}),
      },
    });
    return row;
  });

  return ok(rowToDefinition(updated));
}

export async function deleteField(
  db: Db,
  actor: Actor,
  fieldId: string,
): Promise<Result<{ deleted: true }, ServiceError>> {
  const existing = await db
    .select()
    .from(slotFields)
    .where(eq(slotFields.id, fieldId))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) return err(serviceError('not_found', 'field not found'));
  requireWorkspaceWrite(actor, existing.workspaceId);

  const signupRow = await db
    .select({ settings: signups.settings })
    .from(signups)
    .where(eq(signups.id, existing.signupId))
    .limit(1)
    .then((r) => r[0]);
  const currentSettings =
    (signupRow?.settings as {
      reminderFromFieldRef?: string;
      groupByFieldRefs?: string[];
      [k: string]: unknown;
    }) ?? {};
  const clearedReminder = currentSettings.reminderFromFieldRef === existing.ref;
  const groupBy = currentSettings.groupByFieldRefs ?? [];
  const removedFromGroupBy = groupBy.includes(existing.ref);
  const settingsChanged = clearedReminder || removedFromGroupBy;
  const nextSettings: Record<string, unknown> = { ...currentSettings };
  if (clearedReminder) delete nextSettings.reminderFromFieldRef;
  if (removedFromGroupBy) {
    nextSettings.groupByFieldRefs = groupBy.filter((ref) => ref !== existing.ref);
  }

  await db.transaction(async (tx) => {
    if (settingsChanged) {
      await tx
        .update(signups)
        .set({ settings: nextSettings, updatedAt: new Date() })
        .where(eq(signups.id, existing.signupId));
    }
    await tx
      .update(slots)
      .set({ values: sql`${slots.values} - ${existing.ref}::text` })
      .where(eq(slots.signupId, existing.signupId));
    await tx.delete(slotFields).where(eq(slotFields.id, fieldId));
    // Unconditional. Gating this on `clearedReminder` missed the case that
    // matters most: with the pointer unset, deleting one of two date fields
    // moves the anchor to the survivor (and deleting the anchor itself strands
    // every slot_at on a column that no longer exists), yet no rebuild ran.
    // The values wipe above can also change what a slot resolves to.
    await recomputeSlotAtForSignup(tx, existing.signupId);
    await recordActivity(tx, {
      signupId: existing.signupId,
      workspaceId: existing.workspaceId,
      actor: { actorId: requireOrganizerId(actor), actorType: 'organizer' },
      eventType: 'field.deleted',
      payload: {
        fieldId,
        ref: existing.ref,
        ...(clearedReminder ? { clearedReminderFromFieldRef: true } : {}),
        ...(removedFromGroupBy ? { removedFromGroupByFieldRefs: true } : {}),
      },
    });
  });

  return ok({ deleted: true });
}

export async function listFields(
  db: Db,
  actor: Actor,
  signupId: string,
): Promise<Result<SlotFieldDefinition[], ServiceError>> {
  const signupRow = await db
    .select()
    .from(signups)
    .where(eq(signups.id, signupId))
    .limit(1)
    .then((r) => r[0]);
  if (!signupRow) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceAccess(actor, signupRow.workspaceId);
  return ok(await listFieldsForSignup(db, signupId));
}

export function validateSlotValues(
  fields: SlotFieldDefinition[],
  values: Record<string, unknown>,
): Result<void, ServiceError> {
  const knownRefs = new Set(fields.map((f) => f.ref));
  for (const ref of Object.keys(values)) {
    if (!knownRefs.has(ref)) {
      return err(
        serviceError('invalid_input', `unknown field ref "${ref}"`, {
          field: ref,
        }),
      );
    }
  }
  for (const field of fields) {
    const r = validateOneValue(field, values[field.ref]);
    if (!r.ok) return r;
  }
  return ok(undefined);
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * A YYYY-MM-DD string naming a day that exists.
 *
 * The shape regex alone accepts 2026-13-45 and 2026-02-30, which reach
 * `new Date()` as an Invalid Date (or, for 02-30, silently roll into March).
 * Checking the parts round-trip rejects both.
 */
function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(y, mo - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d;
}

/** An HH:MM string naming a time that exists. The shape regex accepts 99:99. */
function isRealTime(value: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

function validateOneValue(field: SlotFieldDefinition, value: unknown): Result<void, ServiceError> {
  if (isMissing(value)) {
    return ok(undefined);
  }

  switch (field.fieldType) {
    case 'text': {
      if (typeof value !== 'string') {
        return err(
          serviceError('invalid_input', `"${field.ref}" must be a string`, {
            field: field.ref,
          }),
        );
      }
      const max = field.config.fieldType === 'text' ? field.config.maxLength : 200;
      if (value.length > max) {
        return err(
          serviceError('invalid_input', `"${field.ref}" exceeds maxLength ${max}`, {
            field: field.ref,
          }),
        );
      }
      return ok(undefined);
    }
    case 'date': {
      if (typeof value !== 'string' || !isRealDate(value)) {
        return err(
          serviceError('invalid_input', `"${field.ref}" must be a real date as YYYY-MM-DD`, {
            field: field.ref,
            received: value,
          }),
        );
      }
      return ok(undefined);
    }
    case 'time': {
      if (typeof value !== 'string' || !isRealTime(value)) {
        return err(
          serviceError('invalid_input', `"${field.ref}" must be a real time as HH:MM`, {
            field: field.ref,
            received: value,
          }),
        );
      }
      return ok(undefined);
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return err(
          serviceError('invalid_input', `"${field.ref}" must be a number`, {
            field: field.ref,
          }),
        );
      }
      return ok(undefined);
    }
    case 'enum': {
      if (typeof value !== 'string') {
        return err(
          serviceError('invalid_input', `"${field.ref}" must be a string`, {
            field: field.ref,
          }),
        );
      }
      const choices = field.config.fieldType === 'enum' ? field.config.choices : [];
      if (!choices.includes(value)) {
        return err(
          serviceError('invalid_input', `"${field.ref}" must be one of: ${choices.join(', ')}`, {
            field: field.ref,
            received: value,
          }),
        );
      }
      return ok(undefined);
    }
  }
}

export interface ReminderFields {
  dateField: SlotFieldDefinition | null;
  timeField: SlotFieldDefinition | null;
}

/** Canonical field order, so resolution never depends on how the caller sorted. */
function byOrder(a: SlotFieldDefinition, b: SlotFieldDefinition): number {
  return a.sortOrder - b.sortOrder || a.ref.localeCompare(b.ref);
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
 * Resolves which fields drive `slots.slot_at`, and therefore reminder timing.
 *
 * Resolution is total: while the signup has any date field, this returns one.
 * It previously refused to choose between two or more date fields, returning a
 * null date that made `extractSlotAt` yield null, `slot_at` stay NULL and the
 * dispatcher's `isNotNull(slots.slotAt)` skip every commitment — reminders died
 * for the whole signup with nothing said to anyone. The `ambiguous` flag that
 * would have let the UI explain it was computed and never read. Adding a second
 * date field is a routine build-page action (and one Magic Compose takes on its
 * own), so it must not be able to switch reminders off.
 *
 * An explicit `reminderFromFieldRef` still wins and deliberately does NOT fall
 * back: a ref pointing at nothing means no anchor, not "pick another column".
 * Falling back would let one typo silently re-aim every reminder on the signup.
 */
export function findReminderFields(
  settings: { reminderFromFieldRef?: string | undefined; [k: string]: unknown },
  fields: SlotFieldDefinition[],
): ReminderFields {
  const dateFields = fields.filter((f) => f.fieldType === 'date').sort(byOrder);
  const dateField = settings.reminderFromFieldRef
    ? (dateFields.find((f) => f.ref === settings.reminderFromFieldRef) ?? null)
    : (dateFields[0] ?? null);

  return { dateField, timeField: pairedTimeField(dateField, fields) };
}
