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
import {
  findReminderFields,
  pickAnchorRef,
  resolveAnchorRef,
  type ReminderFields,
} from '@/lib/reminder-fields';
import { err, ok, type Result } from '@/lib/result';
import {
  type SlotFieldConfig,
  type SlotFieldDefinition,
  SlotFieldInputSchema,
  SlotFieldUpdateInputSchema,
} from '@/schemas/slot-fields';

type FieldRow = typeof slotFields.$inferSelect;

// The pure resolution rules live in src/lib/reminder-fields.ts so the build
// page can share them; re-exported here for the callers that already import
// them alongside the field services.
export { findReminderFields, pickAnchorRef, type ReminderFields };

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
 * Split out so callers can tell a date-only slot from one with a real time.
 * The stored instant cannot: `extractSlotAt` anchors a date-only slot at
 * `12:00:00`, which is byte-for-byte what a genuine `12:00` produces.
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

/**
 * The instant a slot's values resolve to, or null when the signup has no
 * anchor date field or the slot's date is blank or not a real date.
 *
 * A signup carries no timezone, so this pins the organizer's wall clock to
 * UTC: a slot with a time is `${date}T${time}:00Z`. A date-only slot anchors
 * at `12:00:00Z`, not midnight. Reminders go out `REMINDER_LEAD_HOURS` before
 * the instant, and noon UTC the day before is still the day before everywhere
 * from UTC-11 to UTC+11 (5am Pacific, 8am New York, 1pm London, 10pm Sydney);
 * midnight UTC was two days early for everyone west of Greenwich. Anything
 * reading the instant back must ask `slotTimeOfDay` whether the slot has a
 * time — noon is not a sentinel, a genuine `12:00` slot stores the same bytes.
 */
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
  const at = new Date(`${dateVal}T${timeOfDay ? `${timeOfDay}:00` : '12:00:00'}.000Z`);
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
    // An omitted sortOrder appends. The build page never sends one, and
    // defaulting it to 0 put every field it added ahead of the template's
    // date column (DEFAULT_TEMPLATE pins it at 1), so a new column
    // reappeared mid-grid after a reload.
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      // Serialise appends per signup: two concurrent adds would otherwise read
      // the same max and land on the same sortOrder, leaving their order to the
      // createdAt tiebreak. The lock is released with the transaction.
      await tx.execute(sql`select 1 from ${signups} where ${signups.id} = ${signupId} for update`);
      const [top] = await tx
        .select({ max: sql<number | null>`max(${slotFields.sortOrder})` })
        .from(slotFields)
        .where(eq(slotFields.signupId, signupId));
      sortOrder = top?.max === null || top?.max === undefined ? 0 : top.max + 1;
    }

    const [row] = await tx
      .insert(slotFields)
      .values({
        id,
        signupId,
        workspaceId: signupRow.workspaceId,
        ref: data.ref,
        label: data.label,
        fieldType: data.fieldType,
        sortOrder,
        config: data.config,
      })
      .returning();
    if (!row) throw new Error('field insert failed');

    // A signup that just gained its first date field now has something to
    // anchor on, and a new time field may pair with the existing date, so the
    // slot_at cache is rebuilt after every add. No-op when nothing resolves
    // differently.
    const anchor = await reanchor(tx, signupId, await listFieldsForSignup(tx, signupId));
    await recomputeSlotAtForSignup(tx, signupId);

    await recordActivity(tx, {
      signupId,
      workspaceId: signupRow.workspaceId,
      actor: { actorId: requireOrganizerId(actor), actorType: 'organizer' },
      eventType: 'field.created',
      payload: {
        fieldId: row.id,
        ref: row.ref,
        fieldType: row.fieldType,
        ...(anchor !== undefined ? { reminderFromFieldRef: anchor } : {}),
      },
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

    // Retyping the anchor away from `date` would leave reminderFromFieldRef
    // naming something that is no longer a date, and reminders would stop for
    // the whole signup with nothing said; retyping *to* `date` on a signup
    // with no anchor gives it one. A reorder can also change which time field
    // pairs with the date. Re-anchor and rebuild rather than predict which of
    // those applied.
    const anchor = await reanchor(
      tx,
      existing.signupId,
      await listFieldsForSignup(tx, existing.signupId),
    );
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
        ...(anchor !== undefined ? { reminderFromFieldRef: anchor } : {}),
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

  await db.transaction(async (tx) => {
    // Settings are read and rewritten inside the transaction, under a row
    // lock: read outside it, a settings save landing in between would be
    // overwritten here with a stale copy. The lock also serialises the
    // re-anchor below against a concurrent add or retype on the same signup.
    const signupRow = await tx
      .select({ settings: signups.settings })
      .from(signups)
      .where(eq(signups.id, existing.signupId))
      .for('update')
      .limit(1)
      .then((r) => r[0]);
    const currentSettings =
      (signupRow?.settings as {
        groupByFieldRefs?: string[];
        [k: string]: unknown;
      }) ?? {};
    const groupBy = currentSettings.groupByFieldRefs ?? [];
    const removedFromGroupBy = groupBy.includes(existing.ref);

    if (removedFromGroupBy) {
      await tx
        .update(signups)
        .set({
          settings: {
            ...currentSettings,
            groupByFieldRefs: groupBy.filter((ref) => ref !== existing.ref),
          },
          updatedAt: new Date(),
        })
        .where(eq(signups.id, existing.signupId));
    }
    await tx
      .update(slots)
      .set({ values: sql`${slots.values} - ${existing.ref}::text` })
      .where(eq(slots.signupId, existing.signupId));
    await tx.delete(slotFields).where(eq(slotFields.id, fieldId));

    // Deleting the anchor moves it to the next date field (or drops it when
    // none is left); deleting a time field changes what pairs with the date;
    // and the values wipe above changes what every slot resolves to. Rebuild
    // unconditionally — gating this on "was it the anchor" missed the rest.
    const moved = await reanchor(
      tx,
      existing.signupId,
      await listFieldsForSignup(tx, existing.signupId),
    );
    await recomputeSlotAtForSignup(tx, existing.signupId);

    await recordActivity(tx, {
      signupId: existing.signupId,
      workspaceId: existing.workspaceId,
      actor: { actorId: requireOrganizerId(actor), actorType: 'organizer' },
      eventType: 'field.deleted',
      payload: {
        fieldId,
        ref: existing.ref,
        ...(moved !== undefined ? { reminderFromFieldRef: moved } : {}),
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
  // Not `Date.UTC(y, …)`: it reads years 0–99 as 1900–1999, so a genuine
  // 0099-12-31 would fail the round trip below. setUTCFullYear takes the year
  // as written.
  const at = new Date(0);
  at.setUTCFullYear(y, mo - 1, d);
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

/**
 * Keeps `settings.reminderFromFieldRef` naming a real date field after a
 * field change. Left alone while it names one of `fields`' date fields;
 * otherwise moved to the first date field, or dropped when there is none.
 * Returns the ref it moved to (null = dropped), or undefined when nothing
 * changed. Must run inside the same transaction as the field change.
 */
async function reanchor(
  tx: Queryable,
  signupId: string,
  fields: SlotFieldDefinition[],
): Promise<string | null | undefined> {
  const row = await tx
    .select({ settings: signups.settings })
    .from(signups)
    .where(eq(signups.id, signupId))
    .limit(1)
    .then((r) => r[0]);
  if (!row) return undefined;
  const settings = (row.settings as ReminderSettingsLike) ?? {};
  const next = resolveAnchorRef(settings, fields);
  if (next === (settings.reminderFromFieldRef ?? null)) return undefined;

  const { reminderFromFieldRef: _stale, ...rest } = settings;
  await tx
    .update(signups)
    .set({
      settings: next === null ? rest : { ...rest, reminderFromFieldRef: next },
      updatedAt: new Date(),
    })
    .where(eq(signups.id, signupId));
  return next;
}
