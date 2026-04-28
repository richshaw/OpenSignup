import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { Db, Queryable } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';
import { serviceError, type ServiceError } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import { parseInputSafe } from '@/lib/parse';
import { requireWorkspaceWrite, type Actor } from '@/lib/policy';
import { err, ok, type Result } from '@/lib/result';
import { toSlug } from '@/lib/slug';
import {
  type SlotUpdateInput,
  SlotBulkInputSchema,
  SlotCreateInputSchema,
  SlotUpdateInputSchema,
} from '@/schemas/slots';
import { extractSlotAt, listFieldsForSignup, validateSlotValues } from './slot-fields';

type SlotRow = typeof slots.$inferSelect;

interface SignupSettingsLike {
  groupByFieldRefs?: string[];
  reminderFromFieldRef?: string | undefined;
  [k: string]: unknown;
}

export async function addSlot(
  db: Db,
  actor: Actor,
  signupId: string,
  rawInput: unknown,
): Promise<Result<SlotRow, ServiceError>> {
  const input = parseInputSafe(SlotCreateInputSchema, rawInput);
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

  const fields = await listFieldsForSignup(db, signupId);
  const valid = validateSlotValues(fields, data.values);
  if (!valid.ok) return valid;

  const settings = (signupRow.settings as SignupSettingsLike) ?? {};
  const slotAt = extractSlotAt(settings, fields, data.values);

  const row = await db.transaction(async (tx) => {
    const ref = await pickAvailableRef(tx, signupId, summarizeValues(data.values));
    const [inserted] = await tx
      .insert(slots)
      .values({
        id: makeId('slot'),
        signupId,
        workspaceId: signupRow.workspaceId,
        ref,
        values: data.values,
        capacity: data.capacity ?? null,
        sortOrder: data.sortOrder ?? Math.floor(Date.now() / 1000),
        slotAt,
        status: 'open',
      })
      .returning();
    if (!inserted) throw new Error('slot insert failed');

    await recordActivity(tx, {
      signupId,
      workspaceId: signupRow.workspaceId,
      actor: { actorId: (actor as { id: string }).id, actorType: 'organizer' },
      eventType: 'slot.created',
      payload: { slotId: inserted.id },
    });
    return inserted;
  });
  return ok(row);
}

export async function addSlotsBulk(
  db: Db,
  actor: Actor,
  signupId: string,
  rawInput: unknown,
): Promise<Result<SlotRow[], ServiceError>> {
  const input = parseInputSafe(SlotBulkInputSchema, rawInput);
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

  const fields = await listFieldsForSignup(db, signupId);
  for (const r of data.rows) {
    const valid = validateSlotValues(fields, r.values);
    if (!valid.ok) return valid;
  }

  const settings = (signupRow.settings as SignupSettingsLike) ?? {};

  const inserted = await db.transaction(async (tx) => {
    const out: SlotRow[] = [];
    for (const [index, row] of data.rows.entries()) {
      const slotAt = extractSlotAt(settings, fields, row.values);
      const ref = await pickAvailableRef(tx, signupId, summarizeValues(row.values));
      const [created] = await tx
        .insert(slots)
        .values({
          id: makeId('slot'),
          signupId,
          workspaceId: signupRow.workspaceId,
          ref,
          values: row.values,
          capacity: row.capacity ?? null,
          sortOrder: row.sortOrder ?? index,
          slotAt,
          status: 'open',
        })
        .returning();
      if (created) out.push(created);
    }

    await recordActivity(tx, {
      signupId,
      workspaceId: signupRow.workspaceId,
      actor: { actorId: (actor as { id: string }).id, actorType: 'organizer' },
      eventType: 'slot.created',
      payload: { count: out.length, bulk: true },
    });
    return out;
  });
  return ok(inserted);
}

export async function updateSlot(
  db: Db,
  actor: Actor,
  slotId: string,
  rawInput: unknown,
): Promise<Result<SlotRow, ServiceError>> {
  const input = parseInputSafe(SlotUpdateInputSchema, rawInput);
  if (!input.ok) return input;
  const data: SlotUpdateInput = input.value;

  const existing = await db.select().from(slots).where(eq(slots.id, slotId)).limit(1);
  const slotRow = existing[0];
  if (!slotRow) return err(serviceError('not_found', 'slot not found'));
  requireWorkspaceWrite(actor, slotRow.workspaceId);

  if (data.capacity !== undefined && data.capacity !== null) {
    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(commitments)
      .where(
        and(
          eq(commitments.slotId, slotId),
          or(eq(commitments.status, 'confirmed'), eq(commitments.status, 'tentative')),
        ),
      );
    const count = countRows[0]?.count ?? 0;
    if (count > data.capacity) {
      return err(
        serviceError('conflict', `capacity (${data.capacity}) is less than active count (${count})`, {
          field: 'capacity',
          received: data.capacity,
          suggestion: 'cancel some commitments before lowering capacity',
        }),
      );
    }
  }

  let nextSlotAt: Date | null | undefined;
  if (data.values !== undefined) {
    const signupRow = await db
      .select()
      .from(signups)
      .where(eq(signups.id, slotRow.signupId))
      .limit(1)
      .then((r) => r[0]);
    if (!signupRow) return err(serviceError('not_found', 'signup not found'));
    const fields = await listFieldsForSignup(db, slotRow.signupId);
    const valid = validateSlotValues(fields, data.values);
    if (!valid.ok) return valid;
    const settings = (signupRow.settings as SignupSettingsLike) ?? {};
    nextSlotAt = extractSlotAt(settings, fields, data.values);
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(slots)
      .set({
        ...(data.values !== undefined ? { values: data.values, slotAt: nextSlotAt ?? null } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(slots.id, slotId))
      .returning();
    if (!row) throw new Error('slot update returned nothing');

    await recordActivity(tx, {
      signupId: row.signupId,
      workspaceId: slotRow.workspaceId,
      actor: { actorId: (actor as { id: string }).id, actorType: 'organizer' },
      eventType: 'slot.updated',
      payload: { slotId, changed: Object.keys(data) },
    });
    return row;
  });
  return ok(updated);
}

export async function deleteSlot(
  db: Db,
  actor: Actor,
  slotId: string,
): Promise<Result<{ deleted: true }, ServiceError>> {
  const existing = await db.select().from(slots).where(eq(slots.id, slotId)).limit(1);
  const slotRow = existing[0];
  if (!slotRow) return err(serviceError('not_found', 'slot not found'));
  requireWorkspaceWrite(actor, slotRow.workspaceId);

  await db.transaction(async (tx) => {
    await tx
      .update(commitments)
      .set({ status: 'orphaned' })
      .where(eq(commitments.slotId, slotId));
    await tx.delete(slots).where(eq(slots.id, slotId));

    await recordActivity(tx, {
      signupId: slotRow.signupId,
      workspaceId: slotRow.workspaceId,
      actor: { actorId: (actor as { id: string }).id, actorType: 'organizer' },
      eventType: 'slot.deleted',
      payload: { slotId },
    });
  });
  return ok({ deleted: true });
}

export async function listSlotsForSignup(db: Db, signupId: string) {
  return db
    .select()
    .from(slots)
    .where(eq(slots.signupId, signupId))
    .orderBy(asc(slots.sortOrder), asc(slots.slotAt), asc(slots.createdAt));
}

function summarizeValues(values: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const val of Object.values(values)) {
    if (val === undefined || val === null || val === '') continue;
    parts.push(String(val));
    if (parts.length >= 2) break;
  }
  return parts.join('-') || 'slot';
}

async function pickAvailableRef(db: Queryable, signupId: string, seed: string): Promise<string> {
  const base = toSlug(seed, { suffix: false, fallback: 'slot' });
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 ? base : `${base}-${toSlug(`${Date.now()}-${i}`, { suffix: false })}`;
    const collision = await db
      .select({ id: slots.id })
      .from(slots)
      .where(and(eq(slots.signupId, signupId), eq(slots.ref, candidate)))
      .limit(1);
    if (collision.length === 0) return candidate;
  }
  return `${base}-${Date.now()}`;
}
