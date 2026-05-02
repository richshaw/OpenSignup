import { and, asc, eq } from 'drizzle-orm';
import type { Db, Queryable } from '@/db/client';
import { signups } from '@/db/schema/signups';
import { slotFields } from '@/db/schema/slot-fields';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';
import { serviceError, type ServiceError } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import { parseInputSafe } from '@/lib/parse';
import { requireOrganizerId, requireWorkspaceAccess, requireWorkspaceWrite, type Actor } from '@/lib/policy';
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
    required: row.required,
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

export function extractSlotAt(
  settings: ReminderSettingsLike,
  fields: SlotFieldDefinition[],
  values: Record<string, unknown>,
): Date | null {
  const { dateField, timeField } = findReminderFields(settings, fields);
  if (!dateField) return null;
  const dateVal = values[dateField.ref];
  if (typeof dateVal !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return null;
  const timeVal = timeField ? values[timeField.ref] : undefined;
  const timePart = typeof timeVal === 'string' && /^\d{2}:\d{2}$/.test(timeVal)
    ? `${timeVal}:00`
    : '00:00:00';
  return new Date(`${dateVal}T${timePart}.000Z`);
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

  if (data.required) {
    const slotRows = await db
      .select({ id: slots.id, values: slots.values })
      .from(slots)
      .where(eq(slots.signupId, signupId));
    const offending = slotRows.filter((r) => {
      const v = (r.values as Record<string, unknown>)?.[data.ref];
      return v === undefined || v === null || v === '';
    });
    if (offending.length > 0) {
      return err(
        serviceError(
          'conflict',
          `cannot add a required field while ${offending.length} slot(s) have no value for "${data.ref}". Make the field optional, or remove/edit the slots first.`,
          {
            field: 'required',
            details: {
              slotIds: offending.slice(0, 20).map((r) => r.id),
              count: offending.length,
            },
          },
        ),
      );
    }
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
        required: data.required,
        sortOrder: data.sortOrder,
        config: data.config,
      })
      .returning();
    if (!row) throw new Error('field insert failed');

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
    return err(
      serviceError('invalid_input', 'fieldType change requires matching config'),
    );
  }
  if (data.config !== undefined) {
    const nextType = data.fieldType ?? existing.fieldType;
    if (data.config.fieldType !== nextType) {
      return err(
        serviceError('invalid_input', 'config.fieldType must match the field type'),
      );
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
    required: data.required ?? existing.required,
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
        ...(data.required !== undefined ? { required: data.required } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.fieldType !== undefined ? { fieldType: data.fieldType } : {}),
        ...(data.config !== undefined ? { config: data.config } : {}),
      })
      .where(eq(slotFields.id, fieldId))
      .returning();
    if (!row) throw new Error('field update returned nothing');

    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      changes[key] = data[key];
    }
    await recordActivity(tx, {
      signupId: existing.signupId,
      workspaceId: existing.workspaceId,
      actor: { actorId: requireOrganizerId(actor), actorType: 'organizer' },
      eventType: 'field.updated',
      payload: { fieldId: row.id, ref: row.ref, changes },
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

  const slotRows = await db
    .select({ id: slots.id, values: slots.values })
    .from(slots)
    .where(eq(slots.signupId, existing.signupId));
  const offending = slotRows.filter((r) => {
    const v = (r.values as Record<string, unknown>)?.[existing.ref];
    return v !== undefined && v !== null && v !== '';
  });
  if (offending.length > 0) {
    return err(
      serviceError('conflict', 'cannot delete a field with stored slot values', {
        details: {
          slotIds: offending.slice(0, 20).map((r) => r.id),
          count: offending.length,
        },
      }),
    );
  }

  const signupRow = await db
    .select({ settings: signups.settings })
    .from(signups)
    .where(eq(signups.id, existing.signupId))
    .limit(1)
    .then((r) => r[0]);
  const currentSettings =
    (signupRow?.settings as { reminderFromFieldRef?: string; groupByFieldRefs?: string[]; [k: string]: unknown }) ?? {};
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
    await tx.delete(slotFields).where(eq(slotFields.id, fieldId));
    if (clearedReminder) {
      await recomputeSlotAtForSignup(tx, existing.signupId);
    }
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

function validateOneValue(
  field: SlotFieldDefinition,
  value: unknown,
): Result<void, ServiceError> {
  if (isMissing(value)) {
    if (field.required) {
      return err(
        serviceError('invalid_input', `"${field.ref}" is required`, { field: field.ref }),
      );
    }
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
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return err(
          serviceError('invalid_input', `"${field.ref}" must be YYYY-MM-DD`, {
            field: field.ref,
          }),
        );
      }
      return ok(undefined);
    }
    case 'time': {
      if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
        return err(
          serviceError('invalid_input', `"${field.ref}" must be HH:MM`, {
            field: field.ref,
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
  /** True when 2+ date fields exist and reminderFromFieldRef is unset. */
  ambiguous: boolean;
}

export function findReminderFields(
  settings: { reminderFromFieldRef?: string | undefined; [k: string]: unknown },
  fields: SlotFieldDefinition[],
): ReminderFields {
  const dateFields = fields.filter((f) => f.fieldType === 'date');
  const timeFields = fields.filter((f) => f.fieldType === 'time');
  const timeField = timeFields.length > 0
    ? [...timeFields].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.ref.localeCompare(b.ref),
      )[0] ?? null
    : null;

  if (settings.reminderFromFieldRef) {
    const explicit = dateFields.find((f) => f.ref === settings.reminderFromFieldRef);
    if (explicit) return { dateField: explicit, timeField, ambiguous: false };
    return { dateField: null, timeField, ambiguous: false };
  }

  if (dateFields.length === 0) {
    return { dateField: null, timeField, ambiguous: false };
  }
  if (dateFields.length === 1) {
    return { dateField: dateFields[0] ?? null, timeField, ambiguous: false };
  }
  return { dateField: null, timeField, ambiguous: true };
}
