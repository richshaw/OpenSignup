import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { Db, Queryable } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { activityActor, recordActivity } from '@/lib/activity';
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
      actor: activityActor(actor),
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
    // Rows without an explicit order go after everything the signup already
    // has, in the order given, so a bulk add appends instead of interleaving
    // with the template's 0..n-1 (which is what defaulting to the array
    // index did, and what `addField` had to fix for fields).
    // Serialise appends per signup, the same way `addField` does: two bulk adds
    // running at once would otherwise read the same max and land on the same
    // sortOrder, leaving their order to the createdAt tiebreak. Released with
    // the transaction.
    await tx.execute(sql`select 1 from ${signups} where ${signups.id} = ${signupId} for update`);
    const [top] = await tx
      .select({ max: sql<number | null>`max(${slots.sortOrder})` })
      .from(slots)
      .where(eq(slots.signupId, signupId));
    const base = (top?.max ?? -1) + 1;
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
          sortOrder: row.sortOrder ?? base + index,
          slotAt,
          status: 'open',
        })
        .returning();
      if (created) out.push(created);
    }

    await recordActivity(tx, {
      signupId,
      workspaceId: signupRow.workspaceId,
      actor: activityActor(actor),
      eventType: 'slot.created',
      payload: { count: out.length, bulk: true, slotIds: out.map((s) => s.id) },
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
    const sumRows = await db
      .select({ sum: sql<number>`coalesce(sum(${commitments.quantity}), 0)::int` })
      .from(commitments)
      .where(
        and(
          eq(commitments.slotId, slotId),
          or(eq(commitments.status, 'confirmed'), eq(commitments.status, 'tentative')),
        ),
      );
    const usedQty = sumRows[0]?.sum ?? 0;
    if (usedQty > data.capacity) {
      return err(
        serviceError(
          'conflict',
          `capacity (${data.capacity}) is less than active quantity (${usedQty})`,
          {
            field: 'capacity',
            received: data.capacity,
            suggestion: 'cancel some commitments before lowering capacity',
          },
        ),
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
      actor: activityActor(actor),
      eventType: 'slot.updated',
      payload: { slotId, changed: Object.keys(data) },
    });
    return row;
  });
  return ok(updated);
}

/**
 * Delete a slot. Anyone committed to it loses their place: the commitments
 * table cascades on the slot's foreign key, so their rows go with it. A
 * caller that cannot show the organizer a confirmation first (the MCP tool)
 * passes `force: false` and gets a `conflict` naming how many people are
 * booked; the browser, which is the organizer, passes `force: true`.
 */
export async function deleteSlot(
  db: Db,
  actor: Actor,
  slotId: string,
  opts: { force?: boolean } = { force: true },
): Promise<Result<{ deleted: true; commitmentsRemoved: number }, ServiceError>> {
  const existing = await db.select().from(slots).where(eq(slots.id, slotId)).limit(1);
  const slotRow = existing[0];
  if (!slotRow) return err(serviceError('not_found', 'slot not found'));
  requireWorkspaceWrite(actor, slotRow.workspaceId);

  return db.transaction(async (tx) => {
    // Lock the slot before counting, on the row `commitToSlot` locks. Counting
    // outside the transaction left a window where someone could take the last
    // place after the count came back empty, and lose it without the organizer
    // ever being asked.
    const [locked] = await tx
      .select()
      .from(slots)
      .where(eq(slots.id, slotId))
      .for('update')
      .limit(1);
    if (!locked) return err(serviceError('not_found', 'slot not found'));

    const [booked] = await tx
      .select({
        rows: sql<number>`count(*)::int`,
        places: sql<number>`coalesce(sum(${commitments.quantity}), 0)::int`,
      })
      .from(commitments)
      .where(
        and(
          eq(commitments.slotId, slotId),
          // `waitlist` counts as signed up here even though it does not count
          // towards capacity (see `committedBySlot`): a waitlisted person is
          // someone a participant-side cancel still applies to, and deleting
          // the slot takes their place away too.
          or(
            eq(commitments.status, 'confirmed'),
            eq(commitments.status, 'tentative'),
            eq(commitments.status, 'waitlist'),
          ),
        ),
      );
    const commitmentsRemoved = booked?.rows ?? 0;
    // One commitment can reserve several places, so the count the organizer is
    // asked about is places, not rows.
    const places = booked?.places ?? 0;

    if (commitmentsRemoved > 0 && opts.force === false) {
      return err(
        serviceError(
          'conflict',
          `${places} ${places === 1 ? 'person has' : 'people have'} signed up for this slot`,
          {
            field: 'slotId',
            suggestion:
              'confirm with the organizer, then call again with force: true to remove the slot and their places',
            details: { filled: places, commitments: commitmentsRemoved },
          },
        ),
      );
    }

    // The commitments go with the slot: their foreign key cascades on delete.
    await tx.delete(slots).where(eq(slots.id, slotId));

    await recordActivity(tx, {
      signupId: slotRow.signupId,
      workspaceId: slotRow.workspaceId,
      actor: activityActor(actor),
      eventType: 'slot.deleted',
      payload: { slotId, commitmentsRemoved, places },
    });
    return ok({ deleted: true, commitmentsRemoved });
  });
}

export async function listSlotsForSignup(db: Db, signupId: string) {
  return db
    .select()
    .from(slots)
    .where(eq(slots.signupId, signupId))
    .orderBy(asc(slots.sortOrder), asc(slots.slotAt), asc(slots.createdAt));
}

export function summarizeValues(values: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const val of Object.values(values)) {
    if (val === undefined || val === null || val === '') continue;
    parts.push(String(val));
    if (parts.length >= 2) break;
  }
  return parts.join('-') || 'slot';
}

export async function pickAvailableRef(
  db: Queryable,
  signupId: string,
  seed: string,
): Promise<string> {
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
