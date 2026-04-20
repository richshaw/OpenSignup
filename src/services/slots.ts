import { and, asc, eq, sql } from 'drizzle-orm';
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
  SlotBulkDateInputSchema,
  SlotCreateInputSchema,
  SlotUpdateInputSchema,
} from '@/schemas/slots';

type SlotRow = typeof slots.$inferSelect;

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

  const row = await db.transaction(async (tx) => {
    const ref = await pickAvailableRef(tx, signupId, data.title);
    const slotAt = extractSlotAt(data);
    const [inserted] = await tx
      .insert(slots)
      .values({
        id: makeId('slot'),
        signupId,
        workspaceId: signupRow.workspaceId,
        ref,
        title: data.title,
        description: data.description,
        slotType: data.slotType,
        capacity: data.capacity ?? null,
        sortOrder: data.sortOrder ?? Math.floor(Date.now() / 1000),
        location: data.location ?? null,
        groupId: data.groupId ?? null,
        typeData: data.data,
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
      payload: { slotId: inserted.id, slotType: inserted.slotType },
    });
    return inserted;
  });
  return ok(row);
}

export async function addSlotsFromDates(
  db: Db,
  actor: Actor,
  signupId: string,
  rawInput: unknown,
): Promise<Result<SlotRow[], ServiceError>> {
  const input = parseInputSafe(SlotBulkDateInputSchema, rawInput);
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

  const rows = await db.transaction(async (tx) => {
    const inserted: SlotRow[] = [];
    for (const [index, iso] of data.dates.entries()) {
      const dayTitle = data.titleTemplate
        ? data.titleTemplate.replace('{date}', iso)
        : formatHumanDate(iso);
      const ref = await pickAvailableRef(tx, signupId, `${iso}-${dayTitle}`);
      const [row] = await tx
        .insert(slots)
        .values({
          id: makeId('slot'),
          signupId,
          workspaceId: signupRow.workspaceId,
          ref,
          title: dayTitle,
          description: '',
          slotType: 'date',
          capacity: data.capacity ?? null,
          sortOrder: index,
          typeData: { date: iso },
          slotAt: new Date(`${iso}T12:00:00.000Z`),
          status: 'open',
        })
        .returning();
      if (row) inserted.push(row);
    }

    await recordActivity(tx, {
      signupId,
      workspaceId: signupRow.workspaceId,
      actor: { actorId: (actor as { id: string }).id, actorType: 'organizer' },
      eventType: 'slot.created',
      payload: { count: inserted.length, bulk: true },
    });
    return inserted;
  });
  return ok(rows);
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
      .where(and(eq(commitments.slotId, slotId), eq(commitments.status, 'confirmed')));
    const count = countRows[0]?.count ?? 0;
    if (count > data.capacity) {
      return err(
        serviceError('conflict', `capacity (${data.capacity}) is less than confirmed count (${count})`, {
          field: 'capacity',
          received: data.capacity,
          suggestion: 'cancel some commitments before lowering capacity',
        }),
      );
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(slots)
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.location !== undefined ? { location: data.location ?? null } : {}),
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

function extractSlotAt(
  input: { slotType: string; data: Record<string, unknown> },
): Date | null {
  if (input.slotType === 'date') {
    const d = input.data.date;
    if (typeof d === 'string') return new Date(`${d}T12:00:00.000Z`);
  }
  if (input.slotType === 'time') {
    const s = input.data.start;
    if (typeof s === 'string') return new Date(s);
  }
  return null;
}

function formatHumanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
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
