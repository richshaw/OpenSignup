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
  SlotReorderInputSchema,
  SlotUpdateInputSchema,
} from '@/schemas/slots';
import { lockSignupForWrite } from './locks';
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

  const { beforeSlotId } = data;
  if (beforeSlotId !== undefined) {
    const numbered = data.rows.findIndex((r) => r.sortOrder !== undefined);
    if (numbered >= 0) {
      return err(
        serviceError('invalid_input', 'sortOrder cannot be used together with beforeSlotId', {
          field: `rows.${numbered}.sortOrder`,
          suggestion:
            'leave sortOrder out: the rows go in front of beforeSlotId, in the order given',
        }),
      );
    }
  }

  const settings = (signupRow.settings as SignupSettingsLike) ?? {};

  return db.transaction(async (tx) => {
    // Serialise appends per signup, the same way `addField` does: two bulk adds
    // running at once would otherwise read the same max and land on the same
    // sortOrder, leaving their order to the createdAt tiebreak.
    await lockSignupForWrite(tx, signupId);
    let base: number;
    let shown: SlotRow[] | undefined;
    if (beforeSlotId !== undefined) {
      // The signup lock keeps bulk adds and reorders out. The single-slot
      // services do not take it, so the slot rows are locked too: a delete or a
      // browser `sortOrder` PATCH in flight finishes first, and the target's
      // position found here is still its position when the renumbering runs.
      // A slot `addSlot` inserts meanwhile is not in this list; with no
      // sortOrder of its own it numbers itself in epoch seconds and stays last.
      shown = await lockSlotsForSignup(tx, signupId);
      base = shown.findIndex((s) => s.id === beforeSlotId);
      if (base < 0) {
        return err(
          serviceError('invalid_input', 'beforeSlotId is not a slot in this signup', {
            field: 'beforeSlotId',
            received: beforeSlotId,
            suggestion: 'call get_signup to see the ids of its slots, in the order they are shown',
          }),
        );
      }
    } else {
      // Rows without an explicit order go after everything the signup already
      // has, in the order given, so a bulk add appends instead of interleaving
      // with the template's 0..n-1 (which is what defaulting to the array
      // index did, and what `addField` had to fix for fields).
      const [top] = await tx
        .select({ max: sql<number | null>`max(${slots.sortOrder})` })
        .from(slots)
        .where(eq(slots.signupId, signupId));
      base = (top?.max ?? -1) + 1;
    }
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

    if (shown) {
      // The new rows already sit at the position they were given, base onwards.
      // Everything else is renumbered around them rather than shifted up by
      // the number of new rows: existing orders can be tied (a template's
      // slots, or several sent as 0) or sparse (`addSlot` uses epoch seconds),
      // and a shift would keep a tie and leave the new rows on the wrong side
      // of it.
      const ids = shown.map((s) => s.id);
      ids.splice(base, 0, ...out.map((s) => s.id));
      await writeSlotOrder(tx, signupId, ids);
    }

    await recordActivity(tx, {
      signupId,
      workspaceId: signupRow.workspaceId,
      actor: activityActor(actor),
      eventType: 'slot.created',
      payload: {
        count: out.length,
        bulk: true,
        slotIds: out.map((s) => s.id),
        ...(beforeSlotId !== undefined ? { beforeSlotId } : {}),
      },
    });
    return ok(out);
  });
}

/**
 * Number a signup's slots 0..n-1 in the order of `orderedIds`, writing only
 * the rows whose order changes. The caller has already passed the policy guard
 * and holds the signup row lock (`lockSignupForWrite`), and `orderedIds` is
 * every slot of the signup: a partial list would tie with the slots it leaves
 * out.
 */
export async function writeSlotOrder(
  tx: Queryable,
  signupId: string,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  // The ids travel as one JSON parameter: drizzle would spread a JS array into
  // one placeholder per id, and 500 slots is a lot of placeholders.
  const wanted = sql`jsonb_array_elements_text(${JSON.stringify(orderedIds)}::jsonb)
    with ordinality as wanted(id, position)`;
  await tx
    .update(slots)
    .set({ sortOrder: sql`(wanted.position - 1)::int`, updatedAt: new Date() })
    .from(wanted)
    .where(
      and(
        eq(slots.signupId, signupId),
        sql`${slots.id} = wanted.id`,
        sql`${slots.sortOrder} <> wanted.position - 1`,
      ),
    );
}

/**
 * Put a signup's slots in a new order. `slotIds` has to be every slot of the
 * signup exactly once: a partial list would leave the slots it skips tied with
 * the ones it names, which is the state this exists to get out of.
 */
export async function reorderSlots(
  db: Db,
  actor: Actor,
  signupId: string,
  rawInput: unknown,
): Promise<Result<SlotRow[], ServiceError>> {
  const input = parseInputSafe(SlotReorderInputSchema, rawInput);
  if (!input.ok) return input;
  const { slotIds } = input.value;

  const signupRow = await db
    .select()
    .from(signups)
    .where(eq(signups.id, signupId))
    .limit(1)
    .then((r) => r[0]);
  if (!signupRow) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceWrite(actor, signupRow.workspaceId);

  return db.transaction(async (tx) => {
    // The same two locks as inserting before a slot, for the same reasons: the
    // signup row keeps bulk adds and other reorders out, and the slot rows make
    // a delete or a browser `sortOrder` PATCH in flight finish first, so the
    // list is checked against the slots the signup really has. A slot `addSlot`
    // inserts meanwhile is not checked; with no sortOrder of its own it
    // numbers itself in epoch seconds and stays last.
    await lockSignupForWrite(tx, signupId);
    const current = await lockSlotsForSignup(tx, signupId);
    const known = new Set(current.map((s) => s.id));

    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const id of slotIds) (seen.has(id) ? duplicates : seen).add(id);
    const unknown = [...seen].filter((id) => !known.has(id));
    const missing = current.filter((s) => !seen.has(s.id)).map((s) => s.id);
    if (duplicates.size > 0 || unknown.length > 0 || missing.length > 0) {
      return err(
        serviceError('invalid_input', 'slotIds must list every slot of the signup exactly once', {
          field: 'slotIds',
          details: {
            ...(missing.length > 0 ? { missing } : {}),
            ...(unknown.length > 0 ? { unknown } : {}),
            ...(duplicates.size > 0 ? { duplicates: [...duplicates] } : {}),
          },
          suggestion:
            'call get_signup to see the ids of its slots, then send every one of them once, ' +
            'in the order you want them shown',
        }),
      );
    }

    await writeSlotOrder(tx, signupId, slotIds);

    // Recorded even when the order already matched: the organizer asked for
    // this order, and a second code path to stay silent is not worth having.
    await recordActivity(tx, {
      signupId,
      workspaceId: signupRow.workspaceId,
      actor: activityActor(actor),
      eventType: 'slot.reordered',
      payload: { slotIds },
    });

    // Read back rather than patched in memory, so the rows carry the
    // `updatedAt` the renumbering gave the ones that moved.
    return ok(await listSlotsForSignup(tx, signupId));
  });
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

/**
 * A signup's slots in the order they are shown, with every row locked until
 * the transaction ends. Take the signup row lock first (`lockSignupForWrite`
 * in ./locks.ts): `commitToSlot` and `deleteSlot` hold one slot row and then
 * key-share the signup, so signup before slots is the only order that cannot
 * deadlock with them.
 */
export async function lockSlotsForSignup(tx: Queryable, signupId: string) {
  return tx
    .select()
    .from(slots)
    .where(eq(slots.signupId, signupId))
    .orderBy(asc(slots.sortOrder), asc(slots.slotAt), asc(slots.createdAt))
    .for('update');
}

export async function listSlotsForSignup(db: Queryable, signupId: string) {
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
