import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import type { Db, Queryable } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { slots, type Slot as SlotRow } from '@/db/schema/slots';
import { activityActor, recordActivities, recordActivity } from '@/lib/activity';
import { serviceError, type ServiceError } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import { parseInputSafe } from '@/lib/parse';
import { requireWorkspaceWrite, type Actor } from '@/lib/policy';
import { err, ok, type Result } from '@/lib/result';
import { isBlankSlotValue } from '@/lib/blank-slot-value';
import { toSlug } from '@/lib/slug';
import {
  type SlotUpdateInput,
  SlotBulkInputSchema,
  SlotCreateInputSchema,
  SlotReorderInputSchema,
  SlotUpdateBulkInputSchema,
  SlotUpdateInputSchema,
} from '@/schemas/slots';
import { MAX_SORT_ORDER } from '@/schemas/common';
import type { StoredSignupSettings } from '@/schemas/signups';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import {
  inWorkspace,
  lockSlot,
  lockSlotsForSignup,
  readLiveSignup,
  SLOT_DISPLAY_ORDER,
  withLockedSignup,
  withSignupWriteLock,
} from './locks';
import { committedBySlot, isActiveCommitment, placesTaken } from './commitments';
import { extractSlotAt, listFieldsForSignup, validateSlotValues } from './slot-fields';
import { everyIdOnceError, nextSortOrder, writeOrder } from './reorder-ids';

export async function addSlot(
  db: Db,
  actor: Actor,
  signupId: string,
  rawInput: unknown,
): Promise<Result<SlotRow, ServiceError>> {
  const input = parseInputSafe(SlotCreateInputSchema, rawInput);
  if (!input.ok) return input;
  const data = input.value;

  // The field and settings services hold the signup lock while they strip a
  // deleted field's values from every slot and rebuild slot_at, and neither can
  // see a row inserted meanwhile. So the insert queues behind them, and the
  // fields and the anchor are read under the lock: a value for a field that has
  // just gone is refused, and slot_at comes from the anchor as it now stands.
  // No slot row is held yet, so signup-then-slots holds.
  return withSignupWriteLock(db, actor, signupId, async (tx, locked) => {
    const fields = await listFieldsForSignup(tx, signupId);
    const valid = validateSlotValues(fields, data.values);
    if (!valid.ok) return valid;

    // An omitted sortOrder appends (`nextSortOrder`), read under the
    // signup lock so two adds cannot land on the same number. It was epoch
    // seconds, from before this held the lock: two slots added in the same
    // second tied, and their order fell to the slot_at tiebreak, so filling
    // the second with an earlier date moved it above the first. Epoch seconds
    // also overflow the int column in 2038.
    const sortOrder = data.sortOrder ?? (await nextSortOrder(tx, slots, signupId));

    const [inserted] = await insertSlots(tx, {
      signupId,
      workspaceId: locked.workspaceId,
      settings: locked.settings,
      fields,
      takenRefs: await readTakenRefs(tx, signupId, locked.workspaceId),
      rows: [{ values: valid.value, capacity: data.capacity, sortOrder }],
    });
    if (!inserted) throw new Error('slot insert failed');

    await recordActivity(tx, {
      signupId,
      workspaceId: locked.workspaceId,
      actor: activityActor(actor),
      eventType: 'slot.created',
      payload: { slotId: inserted.id },
    });
    return ok(inserted);
  });
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

  // Serialise appends per signup, the same way `addField` does: two bulk adds
  // running at once would otherwise read the same max and land on the same
  // sortOrder, leaving their order to the createdAt tiebreak.
  return withSignupWriteLock(db, actor, signupId, async (tx, locked) => {
    // Read under the lock, as in `addSlot`: a field delete or an anchor move
    // that this waited for has committed, and the rows are checked against the
    // fields, and take their slot_at from the anchor, as it left them.
    const fields = await listFieldsForSignup(tx, signupId);
    const rowValues: Record<string, unknown>[] = [];
    for (const r of data.rows) {
      const valid = validateSlotValues(fields, r.values);
      if (!valid.ok) return valid;
      rowValues.push(valid.value);
    }
    const settings = locked.settings;

    let base: number;
    let shown: SlotRow[] | undefined;
    if (beforeSlotId !== undefined) {
      // The signup lock keeps every other add, edit and reorder out.
      // `deleteSlot` does not take it, so the slot rows are locked too: a
      // delete in flight finishes first, and the target's position found here
      // is still its position when the renumbering runs.
      shown = await lockSlotsForSignup(tx, signupId, locked.workspaceId);
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
      base = await nextSortOrder(tx, slots, signupId);
    }
    const out = await insertSlots(tx, {
      signupId,
      workspaceId: locked.workspaceId,
      settings,
      fields,
      // The renumbering below locked every slot row already, so their refs
      // come from those; otherwise one read, under the signup lock.
      takenRefs: shown
        ? new Set(shown.map((s) => s.ref))
        : await readTakenRefs(tx, signupId, locked.workspaceId),
      rows: data.rows.map((row, index) => ({
        values: rowValues[index] ?? {},
        capacity: row.capacity ?? null,
        sortOrder: row.sortOrder ?? Math.min(base + index, MAX_SORT_ORDER),
      })),
    });

    if (shown) {
      // The new rows already sit at the position they were given, base onwards.
      // Everything else is renumbered around them rather than shifted up by
      // the number of new rows: existing orders can be tied (a template's
      // slots, or several sent as 0) or sparse (`addSlot` used epoch seconds),
      // and a shift would keep a tie and leave the new rows on the wrong side
      // of it.
      const ids = shown.map((s) => s.id);
      ids.splice(base, 0, ...out.map((s) => s.id));
      await writeOrder(tx, slots, signupId, ids);
    }

    await recordActivity(tx, {
      signupId,
      workspaceId: locked.workspaceId,
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

  // The same two locks as inserting before a slot, for the same reasons: the
  // signup row keeps adds, edits and other reorders out, and the slot rows make
  // a delete in flight finish first, so the list is checked against the slots
  // the signup really has.
  return withSignupWriteLock(db, actor, signupId, async (tx, locked) => {
    const current = await lockSlotsForSignup(tx, signupId, locked.workspaceId);
    const bad = everyIdOnceError(
      slotIds,
      current.map((s) => s.id),
      'slot',
    );
    if (bad) return err(bad);

    await writeOrder(tx, slots, signupId, slotIds);

    // Recorded even when the order already matched: the organizer asked for
    // this order, and a second code path to stay silent is not worth having.
    await recordActivity(tx, {
      signupId,
      workspaceId: locked.workspaceId,
      actor: activityActor(actor),
      eventType: 'slot.reordered',
      payload: { slotIds },
    });

    // Read back rather than patched in memory, so the rows carry the
    // `updatedAt` the renumbering gave the ones that moved.
    return ok(await listSlotsForSignup(tx, signupId));
  });
}

/**
 * Change several slots of one signup in one go, by `updateSlot`'s rules: each
 * row's values are checked against the fields and replace all of that slot's
 * values, a capacity can't go below the places already taken, and slot_at comes
 * from the reminder anchor. All or nothing: the first row refused comes back
 * with its index in `field` (`slots.3.capacity`), and nothing is written.
 * Returns the slots in the order given.
 */
export async function updateSlotsBulk(
  db: Db,
  actor: Actor,
  signupId: string,
  rawInput: unknown,
): Promise<Result<SlotRow[], ServiceError>> {
  const input = parseInputSafe(SlotUpdateBulkInputSchema, rawInput);
  if (!input.ok) return input;
  const rows = input.value.slots;

  const seen = new Set<string>();
  for (const [i, row] of rows.entries()) {
    if (seen.has(row.slotId)) {
      return err(
        serviceError('invalid_input', 'each slot can be changed only once per call', {
          field: `slots.${i}.slotId`,
          received: row.slotId,
          suggestion: 'merge the changes to this slot into one row',
        }),
      );
    }
    seen.add(row.slotId);
  }

  // Signup first, then every slot row, as the reorder and insert-before paths
  // do (src/services/locks.ts). The signup lock makes a field change or an
  // anchor move in flight finish first, so values are checked against the
  // fields as it left them; the slot locks are the ones `commitToSlot` takes,
  // so no place can be taken between the capacity check and the write.
  return withSignupWriteLock(db, actor, signupId, async (tx, locked) => {
    const current = new Map(
      (await lockSlotsForSignup(tx, signupId, locked.workspaceId)).map((s) => [s.id, s]),
    );
    const fields = rows.some((r) => r.values !== undefined)
      ? await listFieldsForSignup(tx, signupId)
      : [];
    const taken = rows.some((r) => r.capacity !== undefined && r.capacity !== null)
      ? await committedBySlot(tx, signupId)
      : {};

    const next: { before: SlotRow; after: SlotRow }[] = [];
    for (const [i, row] of rows.entries()) {
      const before = current.get(row.slotId);
      if (!before) {
        return err(
          serviceError('invalid_input', 'slotId is not a slot in this signup', {
            field: `slots.${i}.slotId`,
            received: row.slotId,
            suggestion: 'call get_signup to see the ids of its slots',
          }),
        );
      }
      if (row.capacity !== undefined && row.capacity !== null) {
        const usedQty = taken[row.slotId] ?? 0;
        if (usedQty > row.capacity) {
          return err(
            serviceError(
              'conflict',
              `capacity (${row.capacity}) is less than active quantity (${usedQty})`,
              {
                field: `slots.${i}.capacity`,
                received: row.capacity,
                suggestion: 'cancel some commitments before lowering capacity',
                details: { reason: 'capacity_below_taken', taken: usedQty, slotId: row.slotId },
              },
            ),
          );
        }
      }
      const after = { ...before };
      if (row.values !== undefined) {
        const valid = validateSlotValues(fields, row.values);
        if (!valid.ok) {
          const e = valid.error;
          return err({ ...e, field: `slots.${i}.values${e.field ? `.${e.field}` : ''}` });
        }
        after.values = valid.value;
        after.slotAt = extractSlotAt(locked.settings, fields, valid.value);
      }
      if (row.capacity !== undefined) after.capacity = row.capacity;
      if (row.status !== undefined) after.status = row.status;
      next.push({ before, after });
    }

    // One statement for every row. Each row is written whole, from the locked
    // row with this call's changes on top, so the SET needs no per-row cases.
    // The rows travel as one JSON parameter, as in `writeOrder`.
    const changes = JSON.stringify(
      next.map(({ after }) => ({
        id: after.id,
        values: after.values,
        slot_at: after.slotAt?.toISOString() ?? null,
        capacity: after.capacity,
        status: after.status,
      })),
    );
    const written = await tx
      .update(slots)
      .set({
        values: sql`u."values"`,
        slotAt: sql`u.slot_at`,
        capacity: sql`u.capacity`,
        status: sql`u.status`,
        updatedAt: new Date(),
      })
      .from(
        sql`jsonb_to_recordset(${changes}::jsonb)
          as u(id text, "values" jsonb, slot_at timestamptz, capacity int, status text)`,
      )
      .where(and(eq(slots.signupId, signupId), sql`${slots.id} = u.id`))
      .returning(getTableColumns(slots));
    const byId = new Map(written.map((r) => [r.id, r]));
    const out = next.map(({ after }) => {
      const row = byId.get(after.id);
      if (!row) throw new Error('slot update returned nothing');
      return row;
    });

    const sent = new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== 'slotId')));
    const by = activityActor(actor);
    // One slot.rescheduled per slot that moved, beside the call's one
    // slot.updated, as `updateSlot` writes them: the slot-change emails and
    // the reminders' settle check read them slot by slot.
    const moved = next.flatMap(({ before }, i) => {
      const row = out[i]!;
      if (rows[i]!.values === undefined || sameInstant(before.slotAt, row.slotAt)) return [];
      return [
        {
          signupId,
          workspaceId: locked.workspaceId,
          actor: by,
          eventType: 'slot.rescheduled' as const,
          payload: {
            slotId: row.id,
            from: before.slotAt?.toISOString() ?? null,
            to: row.slotAt?.toISOString() ?? null,
          },
        },
      ];
    });
    await recordActivities(tx, [
      {
        signupId,
        workspaceId: locked.workspaceId,
        actor: by,
        eventType: 'slot.updated',
        payload: {
          slotIds: out.map((r) => r.id),
          changed: ['values', 'capacity', 'status'].filter((k) => sent.has(k)),
          bulk: true,
        },
      },
      ...moved,
    ]);
    return ok(out);
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

  return withLockedSignup(db, actor, slotRow, async (tx, signupRow) => {
    // Every check below reads under two locks, taken signup first, then the
    // slot (see src/services/locks.ts). The signup lock makes a field change
    // or an anchor move in flight finish first, so the values are checked
    // against the fields as it left them and slot_at comes from the anchor as
    // it now stands; read before the transaction, a field deleted meanwhile
    // got its value written back, and the instant came from the old anchor.
    // The slot lock is the one `commitToSlot` takes, so the count of places
    // taken cannot go up between the capacity check and the write.
    // The signup lock is `withLockedSignup`'s, which answers not found for a
    // soft delete that committed while this waited, too.
    const locked = await lockSlot(tx, slotId, slotRow.workspaceId);
    // Deleted while this waited.
    if (!locked) return err(serviceError('not_found', 'slot not found'));

    if (data.capacity !== undefined && data.capacity !== null) {
      const usedQty = await placesTaken(tx, slotId);
      if (usedQty > data.capacity) {
        return err(
          serviceError(
            'conflict',
            `capacity (${data.capacity}) is less than active quantity (${usedQty})`,
            {
              field: 'capacity',
              received: data.capacity,
              suggestion: 'cancel some commitments before lowering capacity',
              details: { reason: 'capacity_below_taken', taken: usedQty },
            },
          ),
        );
      }
    }

    let nextSlotAt: Date | null | undefined;
    let nextValues: Record<string, unknown> | undefined;
    if (data.values !== undefined) {
      const fields = await listFieldsForSignup(tx, locked.signupId);
      const valid = validateSlotValues(fields, data.values);
      if (!valid.ok) return valid;
      nextValues = valid.value;
      nextSlotAt = extractSlotAt(signupRow.settings, fields, nextValues);
    }

    const [row] = await tx
      .update(slots)
      .set({
        ...(nextValues !== undefined ? { values: nextValues, slotAt: nextSlotAt ?? null } : {}),
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
      workspaceId: locked.workspaceId,
      actor: activityActor(actor),
      eventType: 'slot.updated',
      payload: { slotId, changed: Object.keys(data) },
    });
    // A new date or time: the row the worker reads to tell the people holding
    // the slot (src/jobs/slot-changes.ts), with where it was, so it can tell
    // what a participant was last told from where the slot is now.
    if (data.values !== undefined && !sameInstant(locked.slotAt, row.slotAt)) {
      await recordActivity(tx, {
        signupId: row.signupId,
        workspaceId: locked.workspaceId,
        actor: activityActor(actor),
        eventType: 'slot.rescheduled',
        payload: {
          slotId,
          from: locked.slotAt?.toISOString() ?? null,
          to: row.slotAt?.toISOString() ?? null,
        },
      });
    }
    return ok(row);
  });
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
  opts: { force: boolean },
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
    const locked = await lockSlot(tx, slotId, slotRow.workspaceId);
    if (!locked) return err(serviceError('not_found', 'slot not found'));
    // A deleted signup's slots are gone with it, as they are to every other
    // write. Read, not locked: this holds a slot row and must not take the
    // signup lock after it (src/services/locks.ts).
    if (!(await readLiveSignup(tx, locked.signupId))) {
      return err(serviceError('not_found', 'signup not found'));
    }

    const [booked] = await tx
      .select({
        rows: sql<number>`count(*)::int`,
        places: sql<number>`coalesce(sum(${commitments.quantity}), 0)::int`,
      })
      .from(commitments)
      .where(
        and(
          eq(commitments.slotId, slotId),
          // `waitlist` counts as signed up here even though it holds no place
          // (`holdsPlace`): a waitlisted person is someone a participant-side
          // cancel still applies to, and deleting the slot takes their place
          // away too.
          isActiveCommitment,
        ),
      );
    const commitmentsRemoved = booked?.rows ?? 0;
    // One commitment can reserve several places, so the count the organizer is
    // asked about is places, not rows.
    const places = booked?.places ?? 0;

    if (commitmentsRemoved > 0 && !opts.force) {
      return err(
        serviceError(
          'conflict',
          `${places} ${places === 1 ? 'person has' : 'people have'} signed up for this slot`,
          {
            field: 'slotId',
            suggestion:
              'confirm with the organizer, then call again with force: true to remove the slot and their places',
            details: {
              reason: 'slot_has_signups',
              filled: places,
              commitments: commitmentsRemoved,
            },
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

export async function listSlotsForSignup(db: Queryable, signupId: string) {
  return db
    .select()
    .from(slots)
    .where(eq(slots.signupId, signupId))
    .orderBy(...SLOT_DISPLAY_ORDER);
}

function summarizeValues(values: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const val of Object.values(values)) {
    if (isBlankSlotValue(val)) continue;
    parts.push(String(val));
    if (parts.length >= 2) break;
  }
  return parts.join('-') || 'slot';
}

/**
 * Insert a signup's new slots in one statement, and return them in the order
 * given. The caller has passed the policy guard and holds whatever lock keeps
 * other writers to this signup out (the signup lock, or a signup nobody else
 * can see yet), so the refs in `takenRefs` are every ref the signup has. Each
 * row's ref is picked against that set, and added to it, so rows with the same
 * values in one call get `-2`, `-3` and so on. Takes no locks of its own.
 */
export async function insertSlots(
  tx: Queryable,
  opts: {
    signupId: string;
    workspaceId: string | null;
    settings: StoredSignupSettings;
    fields: SlotFieldDefinition[];
    takenRefs: Set<string>;
    rows: { values: Record<string, unknown>; capacity: number | null; sortOrder: number }[];
  },
): Promise<SlotRow[]> {
  const { signupId, workspaceId, settings, fields, takenRefs, rows } = opts;
  // drizzle refuses values([]).
  if (rows.length === 0) return [];
  const values = rows.map((row) => ({
    id: makeId('slot'),
    signupId,
    workspaceId,
    ref: pickRef(takenRefs, summarizeValues(row.values)),
    values: row.values,
    capacity: row.capacity,
    sortOrder: row.sortOrder,
    slotAt: extractSlotAt(settings, fields, row.values),
    status: 'open',
  }));
  const inserted = await tx.insert(slots).values(values).returning();
  // RETURNING's order isn't guaranteed, so match the rows by the ids made here.
  const byId = new Map(inserted.map((row) => [row.id, row]));
  return values.map(({ id }) => {
    const row = byId.get(id);
    if (!row) throw new Error('slot insert failed');
    return row;
  });
}

/** Every ref a signup's slots already use, for `insertSlots`. */
async function readTakenRefs(
  tx: Queryable,
  signupId: string,
  workspaceId: string | null,
): Promise<Set<string>> {
  const rows = await tx
    .select({ ref: slots.ref })
    .from(slots)
    .where(and(eq(slots.signupId, signupId), inWorkspace(slots.workspaceId, workspaceId)));
  return new Set(rows.map((r) => r.ref));
}

/** The slug of `seed`, or the first of `-2`, `-3`, … that `taken` hasn't got. */
function pickRef(taken: Set<string>, seed: string): string {
  const base = toSlug(seed, { suffix: false, fallback: 'slot' });
  let ref = base;
  for (let n = 2; taken.has(ref); n++) ref = `${base}-${n}`;
  taken.add(ref);
  return ref;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  return a === null || b === null ? a === b : a.getTime() === b.getTime();
}
