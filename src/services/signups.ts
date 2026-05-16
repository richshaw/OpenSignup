import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { signups } from '@/db/schema/signups';
import { slotFields } from '@/db/schema/slot-fields';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';
import { serviceError, ServiceException, type ServiceError } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import { parseInputSafe } from '@/lib/parse';
import { requireOrganizerId, requireWorkspaceAccess, requireWorkspaceWrite, type Actor } from '@/lib/policy';
import { err, ok, type Result } from '@/lib/result';
import { DEFAULT_TEMPLATE, type SignupTemplate } from '@/lib/signup-templates';
import { toSlug } from '@/lib/slug';
import { type SlotFieldDefinition, type SlotFieldInput, SlotFieldInputSchema } from '@/schemas/slot-fields';
import {
  type SignupStatus,
  SignupCreateInputSchema,
  SignupUpdateInputSchema,
} from '@/schemas/signups';
import { type SlotCreateInput, SlotCreateInputSchema } from '@/schemas/slots';
import {
  extractSlotAt,
  listFieldsForSignup,
  recomputeSlotAtForSignup,
  validateSlotValues,
} from './slot-fields';
import { pickAvailableRef, summarizeValues } from './slots';

interface ReminderSettingsLike {
  reminderFromFieldRef?: string | undefined;
  [k: string]: unknown;
}

type SignupRow = typeof signups.$inferSelect;

export interface SignupWithSlots extends SignupRow {
  slots: (typeof slots.$inferSelect)[];
  fields: SlotFieldDefinition[];
}

export async function createSignup(
  db: Db,
  actor: Actor,
  workspaceId: string,
  rawInput: unknown,
  opts: { template?: SignupTemplate } = {},
): Promise<Result<SignupRow, ServiceError>> {
  requireWorkspaceWrite(actor, workspaceId);
  if (actor.kind !== 'organizer') {
    return err(serviceError('unauthorized', 'organizer required'));
  }

  const input = parseInputSafe(SignupCreateInputSchema, rawInput);
  if (!input.ok) return input;
  const data = input.value;

  const template = opts.template ?? DEFAULT_TEMPLATE;

  const parsedFields: SlotFieldInput[] = [];
  const seenRefs = new Set<string>();
  for (const field of template.fields) {
    const parsed = SlotFieldInputSchema.safeParse(field);
    if (!parsed.success) {
      return err(
        serviceError('invalid_input', `template "${template.id}" has an invalid field`, {
          field: 'template',
          details: { templateId: template.id, error: parsed.error.flatten() },
        }),
      );
    }
    if (seenRefs.has(parsed.data.ref)) {
      return err(
        serviceError('invalid_input', `template "${template.id}" has duplicate field ref "${parsed.data.ref}"`, {
          field: 'template',
          details: { templateId: template.id, ref: parsed.data.ref },
        }),
      );
    }
    seenRefs.add(parsed.data.ref);
    parsedFields.push(parsed.data);
  }

  const parsedSlots: SlotCreateInput[] = [];
  for (const slot of template.slots) {
    const parsed = SlotCreateInputSchema.safeParse(slot);
    if (!parsed.success) {
      return err(
        serviceError('invalid_input', `template "${template.id}" has an invalid slot`, {
          field: 'template',
          details: { templateId: template.id, error: parsed.error.flatten() },
        }),
      );
    }
    parsedSlots.push(parsed.data);
  }

  const fieldDefs: SlotFieldDefinition[] = parsedFields.map((f) => ({
    id: '',
    ref: f.ref,
    label: f.label,
    fieldType: f.fieldType,
    required: f.required,
    sortOrder: f.sortOrder,
    config: f.config,
  }));
  for (const slot of parsedSlots) {
    const v = validateSlotValues(fieldDefs, slot.values, { enforceRequired: false });
    if (!v.ok) return v;
  }

  const id = makeId('sig');
  const slug = await pickAvailableSlug(db, data.title);

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(signups)
      .values({
        id,
        workspaceId,
        organizerId: actor.id,
        slug,
        title: data.title,
        description: data.description,
        visibility: data.visibility,
        tags: data.tags,
        settings: data.settings,
        closesAt: data.closesAt ? new Date(data.closesAt) : null,
        status: 'draft',
      })
      .returning();
    if (!inserted) throw new Error('insert failed');

    const settings = (inserted.settings as ReminderSettingsLike) ?? {};

    for (const field of parsedFields) {
      await tx.insert(slotFields).values({
        id: makeId('fld'),
        signupId: inserted.id,
        workspaceId,
        ref: field.ref,
        label: field.label,
        fieldType: field.fieldType,
        required: field.required,
        sortOrder: field.sortOrder,
        config: field.config,
      });
    }

    for (const [index, slot] of parsedSlots.entries()) {
      const ref = await pickAvailableRef(tx, inserted.id, summarizeValues(slot.values));
      const slotAt = extractSlotAt(settings, fieldDefs, slot.values);
      await tx.insert(slots).values({
        id: makeId('slot'),
        signupId: inserted.id,
        workspaceId,
        ref,
        values: slot.values,
        capacity: slot.capacity,
        sortOrder: slot.sortOrder ?? index,
        slotAt,
        status: 'open',
      });
    }

    await recordActivity(tx, {
      signupId: inserted.id,
      workspaceId,
      actor: { actorId: requireOrganizerId(actor), actorType: 'organizer' },
      eventType: 'signup.created',
      payload: {
        templateId: template.id,
        fieldsAdded: template.fields.length,
        slotsAdded: template.slots.length,
      },
    });
    return inserted;
  });

  return ok(row);
}

export async function getSignupForOrganizer(
  db: Db,
  actor: Actor,
  signupId: string,
): Promise<Result<SignupWithSlots, ServiceError>> {
  const found = await db.select().from(signups).where(eq(signups.id, signupId)).limit(1);
  const row = found[0];
  if (!row) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceAccess(actor, row.workspaceId);
  const [signupSlots, fields] = await Promise.all([
    db
      .select()
      .from(slots)
      .where(eq(slots.signupId, signupId))
      .orderBy(asc(slots.sortOrder), asc(slots.slotAt), asc(slots.createdAt)),
    listFieldsForSignup(db, signupId),
  ]);
  return ok({ ...row, slots: signupSlots, fields });
}

export async function updateSignup(
  db: Db,
  actor: Actor,
  signupId: string,
  rawInput: unknown,
): Promise<Result<SignupRow, ServiceError>> {
  const existing = await db.select().from(signups).where(eq(signups.id, signupId)).limit(1);
  const row = existing[0];
  if (!row) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceWrite(actor, row.workspaceId);

  const input = parseInputSafe(SignupUpdateInputSchema, rawInput);
  if (!input.ok) return input;
  const data = input.value;

  const prevSettings = (row.settings as { reminderFromFieldRef?: string; [k: string]: unknown }) ?? {};
  // Replacement (not merge): callers must pass the complete settings object.
  // Omitting a key is how optional fields (e.g. reminderFromFieldRef) are cleared.
  const mergedSettings = data.settings ?? prevSettings;
  const reminderRefChanged =
    data.settings !== undefined &&
    mergedSettings.reminderFromFieldRef !== prevSettings.reminderFromFieldRef;

  const patched = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(signups)
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.closesAt !== undefined
          ? { closesAt: data.closesAt ? new Date(data.closesAt) : null }
          : {}),
        ...(data.settings !== undefined ? { settings: mergedSettings } : {}),
        updatedAt: new Date(),
      })
      .where(eq(signups.id, signupId))
      .returning();
    if (!updated) throw new Error('update returned nothing');

    if (reminderRefChanged) {
      await recomputeSlotAtForSignup(tx, signupId);
    }

    await recordActivity(tx, {
      signupId,
      workspaceId: row.workspaceId,
      actor: { actorId: requireOrganizerId(actor), actorType: 'organizer' },
      eventType: 'signup.updated',
      payload: { changed: Object.keys(data) },
    });
    return updated;
  });

  return ok(patched);
}

export async function publishSignup(
  db: Db,
  actor: Actor,
  signupId: string,
): Promise<Result<SignupRow, ServiceError>> {
  return transitionStatus(db, actor, signupId, 'draft', 'open', 'signup.published');
}

export async function closeSignup(
  db: Db,
  actor: Actor,
  signupId: string,
): Promise<Result<SignupRow, ServiceError>> {
  return transitionStatus(db, actor, signupId, 'open', 'closed', 'signup.closed');
}

export async function archiveSignup(
  db: Db,
  actor: Actor,
  signupId: string,
): Promise<Result<SignupRow, ServiceError>> {
  return transitionStatus(db, actor, signupId, null, 'archived', 'signup.archived');
}

async function transitionStatus(
  db: Db,
  actor: Actor,
  signupId: string,
  from: SignupStatus | null,
  to: SignupStatus,
  eventType: 'signup.published' | 'signup.closed' | 'signup.archived',
): Promise<Result<SignupRow, ServiceError>> {
  const existing = await db.select().from(signups).where(eq(signups.id, signupId)).limit(1);
  const row = existing[0];
  if (!row) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceWrite(actor, row.workspaceId);

  if (from !== null && row.status !== from) {
    return err(
      serviceError('conflict', `cannot ${to} a signup that is ${row.status}`, {
        field: 'status',
        received: row.status,
        expected: from,
        suggestion: `call the correct transition for status=${row.status}`,
      }),
    );
  }

  if (to === 'open') {
    const slotCount = await db.$count(slots, eq(slots.signupId, signupId));
    if (slotCount < 1) {
      return err(
        serviceError('conflict', 'publish requires at least one slot', {
          suggestion: 'add a slot before publishing',
        }),
      );
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [next] = await tx
      .update(signups)
      .set({
        status: to,
        opensAt: to === 'open' && !row.opensAt ? new Date() : row.opensAt,
        updatedAt: new Date(),
      })
      .where(eq(signups.id, signupId))
      .returning();
    if (!next) throw new Error('update returned nothing');

    await recordActivity(tx, {
      signupId,
      workspaceId: row.workspaceId,
      actor: { actorId: requireOrganizerId(actor), actorType: 'organizer' },
      eventType,
      payload: { from: row.status, to },
    });
    return next;
  });

  return ok(updated);
}

export async function listSignupsForWorkspace(
  db: Db,
  actor: Actor,
  workspaceId: string,
  filter: { status?: SignupStatus } = {},
): Promise<Result<SignupRow[], ServiceError>> {
  requireWorkspaceAccess(actor, workspaceId);
  const where = filter.status
    ? and(eq(signups.workspaceId, workspaceId), eq(signups.status, filter.status))
    : eq(signups.workspaceId, workspaceId);
  const rows = await db
    .select()
    .from(signups)
    .where(and(where, isNull(signups.deletedAt)))
    .orderBy(desc(signups.createdAt))
    .limit(200);
  return ok(rows);
}

export async function getPublicSignup(
  db: Db,
  slug: string,
): Promise<Result<SignupWithSlots & { committedBySlot: Record<string, number> }, ServiceError>> {
  const found = await db.select().from(signups).where(eq(signups.slug, slug)).limit(1);
  const row = found[0];
  if (!row || row.deletedAt) return err(serviceError('not_found', 'signup not found'));
  if (row.status === 'draft') {
    return err(serviceError('not_found', 'signup not yet published', { received: 'draft' }));
  }
  if (row.status === 'archived') {
    return err(serviceError('not_found', 'signup is no longer available', { received: 'archived' }));
  }

  const [signupSlots, fields] = await Promise.all([
    db
      .select()
      .from(slots)
      .where(eq(slots.signupId, row.id))
      .orderBy(asc(slots.sortOrder), asc(slots.slotAt), asc(slots.createdAt)),
    listFieldsForSignup(db, row.id),
  ]);

  const committerRows = await db
    .select({
      slotId: commitments.slotId,
      sum: sql<number>`coalesce(sum(${commitments.quantity}), 0)::int`,
    })
    .from(commitments)
    .where(
      and(
        eq(commitments.signupId, row.id),
        or(eq(commitments.status, 'confirmed'), eq(commitments.status, 'tentative')),
      ),
    )
    .groupBy(commitments.slotId);

  const committedBySlot: Record<string, number> = {};
  for (const c of committerRows) {
    committedBySlot[c.slotId] = c.sum;
  }

  return ok({ ...row, slots: signupSlots, fields, committedBySlot });
}

async function pickAvailableSlug(db: Db, title: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const candidate = toSlug(title, { suffix: true });
    const collision = await db
      .select({ id: signups.id })
      .from(signups)
      .where(eq(signups.slug, candidate))
      .limit(1);
    if (collision.length === 0) return candidate;
  }
  throw new ServiceException(serviceError('internal', 'could not generate unique slug'));
}

