import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db, Queryable, Tx } from '@/db/client';
import { signups } from '@/db/schema/signups';
import { slotFields } from '@/db/schema/slot-fields';
import { slots } from '@/db/schema/slots';
import { activityActor, recordActivity } from '@/lib/activity';
import { serviceError, type ServiceError } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import { parseInputSafe } from '@/lib/parse';
import { requireWorkspaceWrite, type Actor } from '@/lib/policy';
import {
  findReminderFields,
  isCalendarDate,
  isRealDate,
  isRealTime,
  MIN_DATE_YEAR,
  resolveAnchorRef,
  slotTimeOfDay,
} from '@/lib/reminder-fields';
import { err, ok, type Result } from '@/lib/result';
import { MAX_SORT_ORDER } from '@/schemas/common';
import {
  TEXT_DEFAULT_MAX_LENGTH,
  type SlotFieldConfig,
  type SlotFieldDefinition,
  SlotFieldInputSchema,
  SlotFieldReorderInputSchema,
  type SlotFieldUpdateInput,
  SlotFieldUpdateInputSchema,
} from '@/schemas/slot-fields';
import type { StoredSignupSettings } from '@/schemas/signups';
import {
  getSignupRowForOrganizer,
  lockSignupForWrite,
  lockSlotsForSignup,
  withSignupWriteLock,
} from './locks';

type FieldRow = typeof slotFields.$inferSelect;

function rowToDefinition(row: FieldRow): SlotFieldDefinition {
  return {
    id: row.id,
    ref: row.ref,
    label: row.label,
    fieldType: row.fieldType,
    sortOrder: row.sortOrder,
    config: row.config as SlotFieldConfig,
  };
}

/** One field row by id, unscoped: the caller judges the actor against its workspace next. */
async function readField(q: Queryable, fieldId: string): Promise<FieldRow | undefined> {
  const [row] = await q.select().from(slotFields).where(eq(slotFields.id, fieldId)).limit(1);
  return row;
}

export async function listFieldsForSignup(
  db: Queryable,
  signupId: string,
): Promise<SlotFieldDefinition[]> {
  const rows = await db
    .select()
    .from(slotFields)
    .where(eq(slotFields.signupId, signupId))
    // The id is the last word. Fields made in one transaction (every field
    // `createSignup` writes) share a `createdAt`, so two of them on one
    // sortOrder had no fixed order and Postgres could return them either way
    // round from one read to the next.
    .orderBy(asc(slotFields.sortOrder), asc(slotFields.createdAt), asc(slotFields.id));
  return rows.map(rowToDefinition);
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
  settings: StoredSignupSettings,
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
  // equal to itself, so rebuildSlotAt's change check never matches
  // and it would send that row back to the database on every single pass.
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Re-derive slots.slot_at for every slot in a signup from `settings` and
 * `fields`, which the caller read under the signup lock it holds
 * (`lockSignupForWrite`) and passes as they now stand, its own changes
 * included. Runs inside the caller's transaction and locks the slot rows
 * after the signup's, so the signup-then-slots order holds.
 */
export async function rebuildSlotAt(
  tx: Tx,
  signupId: string,
  workspaceId: string | null,
  settings: StoredSignupSettings,
  fields: SlotFieldDefinition[],
): Promise<{ updated: number }> {
  // Locked, not just read. A slot edit takes the signup lock the caller holds,
  // so none is in flight here; the rows are locked all the same, in the shared
  // order, before any is written, and a slot held without the signup lock
  // (someone signing up, a delete) finishes first and comes back as it was
  // left. Read unlocked, a slot edit that took no signup lock once had its new
  // date overwritten here with the old date's.
  const slotRows = await lockSlotsForSignup(tx, signupId, workspaceId);

  const changed: { id: string; at: Date | null }[] = [];
  for (const row of slotRows) {
    const next = extractSlotAt(settings, fields, row.values);
    const cur = row.slotAt;
    const same =
      (next === null && cur === null) ||
      (next instanceof Date && cur instanceof Date && next.getTime() === cur.getTime());
    if (same) continue;
    changed.push({ id: row.id, at: next });
  }
  if (changed.length === 0) return { updated: 0 };

  // One statement for every row that moves, not one per row: the signup lock
  // and every slot row stay held until this transaction ends, and a slot add
  // or edit queued behind them waits with a pooled connection in hand. The
  // rows travel as one JSON parameter (a Date as its ISO string), as in
  // `writeSlotOrder`. Postgres has the last word on what changed: the check
  // above compares with the instant as the driver read it back, and the driver
  // cannot read every instant. Postgres prints one in the session's time zone,
  // and where that zone's offset then had seconds in it (Amsterdam's +00:19:32
  // until 1937, Dublin's until 1916) the driver makes an Invalid Date of it.
  // Every connection the app opens is pinned to UTC (`SESSION_SETTINGS` in
  // src/db/client.ts), but a session can still `SET` another zone, and there
  // the check sees that slot move on every rebuild. A row sent can still be
  // equal.
  const wanted = sql`jsonb_to_recordset(${JSON.stringify(changed)}::jsonb)
    as wanted(id text, at timestamptz)`;
  const written = await tx
    .update(slots)
    .set({ slotAt: sql`wanted.at` })
    .from(wanted)
    .where(
      and(
        eq(slots.signupId, signupId),
        sql`${slots.id} = wanted.id`,
        sql`${slots.slotAt} is distinct from wanted.at`,
      ),
    )
    .returning({ id: slots.id });
  return { updated: written.length };
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
  const { beforeFieldId } = data;
  if (beforeFieldId !== undefined && data.sortOrder !== undefined) {
    return err(
      serviceError('invalid_input', 'sortOrder cannot be used together with beforeFieldId', {
        field: 'sortOrder',
        suggestion: 'leave sortOrder out: the field goes in front of beforeFieldId',
      }),
    );
  }

  const id = makeId('fld');
  // The signup lock is taken whatever the input: a date or time field
  // re-anchors below, which reads settings and writes them back, and a settings
  // save landing in between would be lost; an append reads the top sortOrder
  // under it. It is cheap, and the order stays the same for all.
  return withSignupWriteLock(db, actor, signupId, async (tx, signupRow) => {
    // An omitted sortOrder appends. The build page never sends one, and
    // defaulting it to 0 put every field it added ahead of the template's
    // date column (DEFAULT_TEMPLATE pins it at 1), so a new column
    // reappeared mid-grid after a reload.
    let sortOrder = data.sortOrder;
    // In front of another field: the new field takes that field's position,
    // and every field is renumbered around it once it is in. The signup lock
    // keeps every other field write out, so the position found here holds.
    let shown: SlotFieldDefinition[] | undefined;
    if (beforeFieldId !== undefined) {
      shown = await listFieldsForSignup(tx, signupId);
      sortOrder = shown.findIndex((f) => f.id === beforeFieldId);
      if (sortOrder < 0) {
        return err(
          serviceError('invalid_input', 'beforeFieldId is not a field in this signup', {
            field: 'beforeFieldId',
            received: beforeFieldId,
            suggestion: 'call get_signup to see the ids of its fields, in the order they are shown',
          }),
        );
      }
    } else if (sortOrder === undefined) {
      // Under the signup lock: two concurrent adds would otherwise read the
      // same max and land on the same sortOrder, leaving their order to the
      // createdAt tiebreak. Held at the column's top, as `nextSlotSortOrder`
      // does for slots: a field sent there would otherwise make every later
      // add fail the insert; past it, appends tie instead.
      const [top] = await tx
        .select({ max: sql<number | null>`max(${slotFields.sortOrder})` })
        .from(slotFields)
        .where(eq(slotFields.signupId, signupId));
      sortOrder =
        top?.max === null || top?.max === undefined ? 0 : Math.min(top.max + 1, MAX_SORT_ORDER);
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
      // The unique index on (signup_id, ref) decides a taken ref, not a read
      // made first. Two adds of one ref at once (a double click, an MCP
      // retry) both passed a read made before the transaction, and the second
      // hit the index as a 500. Now the second waits for the first, on the
      // signup lock or on the index itself, and inserts nothing.
      .onConflictDoNothing({ target: [slotFields.signupId, slotFields.ref] })
      .returning();
    if (!row) {
      return err(
        serviceError('conflict', `field ref "${data.ref}" already exists`, {
          field: 'ref',
          received: data.ref,
        }),
      );
    }

    // Set when the renumbering below swapped two date or time fields that
    // were tied, which moves slot_at even though the new field is neither.
    let timelineMoved = false;
    if (shown) {
      // Renumbered rather than shifted down by one: orders can be tied (the
      // state this exists to get out of), and a shift would keep the tie.
      const ids = shown.map((f) => f.id);
      ids.splice(sortOrder, 0, row.id);
      await writeFieldOrder(tx, signupId, ids);
      const renumbered = new Map(ids.map((fieldId, i) => [fieldId, i]));
      timelineMoved =
        timeline(shown) !==
        timeline(shown.map((f) => ({ ...f, sortOrder: renumbered.get(f.id) ?? f.sortOrder })));
    }

    // A signup that just gained its first date field now has something to
    // anchor on, and a new time field may pair with the existing date, so
    // adding either re-anchors and rebuilds the slot_at cache. No-op when
    // nothing resolves differently.
    //
    // Any other type is skipped. The anchor and slot_at read only the type and
    // order of date and time fields (src/lib/reminder-fields.ts), and no slot
    // has a value for a field that did not exist, so a text, number or enum
    // field cannot move either, unless placing it renumbered two tied date or
    // time fields into a different order. The rebuild locks every slot row:
    // run for one of those, the add would queue behind everyone part-way
    // through signing up and then hold up everyone after them. Gated on the
    // type, not on "is this the anchor": a time field is never the anchor and
    // still moves slot_at (see `deleteField`).
    let anchor: string | null | undefined;
    if (isDateOrTime(row.fieldType) || timelineMoved) {
      anchor = await syncAnchorAndSlotAt(tx, signupId, signupRow.workspaceId);
    }

    await recordActivity(tx, {
      signupId,
      workspaceId: signupRow.workspaceId,
      actor: activityActor(actor),
      eventType: 'field.created',
      payload: {
        fieldId: row.id,
        ref: row.ref,
        fieldType: row.fieldType,
        ...(beforeFieldId !== undefined ? { beforeFieldId } : {}),
        ...(anchor !== undefined ? { reminderFromFieldRef: anchor } : {}),
      },
    });
    return ok(rowToDefinition(row));
  });
}

/**
 * Number a signup's fields 0..n-1 in the order of `orderedIds`, writing only
 * the rows whose order changes. The caller has passed the policy guard and
 * holds the signup lock, and `orderedIds` is every field of the signup, as
 * `writeSlotOrder` asks of slots.
 */
async function writeFieldOrder(tx: Queryable, signupId: string, orderedIds: string[]) {
  const wanted = sql`jsonb_array_elements_text(${JSON.stringify(orderedIds)}::jsonb)
    with ordinality as wanted(id, position)`;
  await tx
    .update(slotFields)
    .set({ sortOrder: sql`(wanted.position - 1)::int` })
    .from(wanted)
    .where(
      and(
        eq(slotFields.signupId, signupId),
        sql`${slotFields.id} = wanted.id`,
        sql`${slotFields.sortOrder} <> wanted.position - 1`,
      ),
    );
}

/**
 * Put a signup's fields in a new order. `fieldIds` has to be every field of
 * the signup exactly once, for the reason `reorderSlots` gives: a partial list
 * would leave the fields it skips tied with the ones it names.
 */
export async function reorderFields(
  db: Db,
  actor: Actor,
  signupId: string,
  rawInput: unknown,
): Promise<Result<SlotFieldDefinition[], ServiceError>> {
  const input = parseInputSafe(SlotFieldReorderInputSchema, rawInput);
  if (!input.ok) return input;
  const { fieldIds } = input.value;

  // Every field write takes the signup lock, so the list read under it is the
  // list the renumbering writes over.
  return withSignupWriteLock(db, actor, signupId, async (tx, signupRow) => {
    const current = await listFieldsForSignup(tx, signupId);
    const known = new Set(current.map((f) => f.id));

    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const id of fieldIds) (seen.has(id) ? duplicates : seen).add(id);
    const unknown = [...seen].filter((id) => !known.has(id));
    const missing = current.filter((f) => !seen.has(f.id)).map((f) => f.id);
    if (duplicates.size > 0 || unknown.length > 0 || missing.length > 0) {
      return err(
        serviceError('invalid_input', 'fieldIds must list every field of the signup exactly once', {
          field: 'fieldIds',
          details: {
            ...(missing.length > 0 ? { missing } : {}),
            ...(unknown.length > 0 ? { unknown } : {}),
            ...(duplicates.size > 0 ? { duplicates: [...duplicates] } : {}),
          },
          suggestion:
            'call get_signup to see the ids of its fields, then send every one of them once, ' +
            'in the order you want them shown',
        }),
      );
    }

    await writeFieldOrder(tx, signupId, fieldIds);
    const next = await listFieldsForSignup(tx, signupId);

    // Which time field pairs with the date, and which date field takes over
    // the anchor, go by the order of the date and time fields, as in
    // `updateField`. Rebuilt only when that order moved: the rebuild locks
    // every slot row, and moving a text column should not queue behind
    // everyone part-way through signing up.
    let anchor: string | null | undefined;
    if (timeline(current) !== timeline(next)) {
      anchor = await syncAnchorAndSlotAt(tx, signupId, signupRow.workspaceId);
    }

    // Recorded even when the order already matched, as `reorderSlots` does.
    await recordActivity(tx, {
      signupId,
      workspaceId: signupRow.workspaceId,
      actor: activityActor(actor),
      eventType: 'field.reordered',
      payload: {
        fieldIds,
        ...(anchor !== undefined ? { reminderFromFieldRef: anchor } : {}),
      },
    });
    return ok(next);
  });
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
  // An update has to ask for something. The PATCH route reads a body that is
  // not JSON as `{}`, and an MCP call can send the field id alone: answering
  // either with the field unchanged would pass off a mistake as a save.
  if (asksForNothing(data)) return err(serviceError('invalid_input', 'nothing to update'));

  const existing = await readField(db, fieldId);
  if (!existing) return err(serviceError('not_found', 'field not found'));
  requireWorkspaceWrite(actor, existing.workspaceId);

  if (data.fieldType !== undefined && data.config === undefined) {
    return err(serviceError('invalid_input', 'fieldType change requires matching config'));
  }
  const mismatch = configMismatch(data, existing.fieldType);
  if (mismatch) return err(mismatch);

  return db.transaction(async (tx) => {
    // The re-anchor below reads settings and writes them back, and the rebuild
    // writes slot rows: both need the signup lock, as in `addField`. Taken even
    // when neither runs. It is cheap, and the order stays the same for all.
    const locked = await lockSignupForWrite(tx, existing.signupId, existing.workspaceId);
    if (!locked) return err(serviceError('not_found', 'signup not found'));

    // Read again under the lock. `deleteField` and another `updateField` take
    // it too, and either may have committed while this one waited: the field
    // can be gone, or be a type the config above was never checked against.
    const current = await readField(tx, fieldId);
    if (!current) return err(serviceError('not_found', 'field not found'));
    const stale = configMismatch(data, current.fieldType);
    if (stale) return err(stale);

    // A value equal to the field's own counts as not sent. The builder's
    // Fields dialog sends the label, type and config with every save, a rename
    // included, so whether they were sent says nothing about whether they
    // changed. The value check, the re-anchor, the slot_at rebuild, the write
    // and the log below all go by `sent`. Compared with the row read under the
    // lock: a save that got in first may have changed it.
    const sent = withoutUnchanged(data, current);
    // Nothing is left when every value sent is one the field already has, as
    // when the dialog is opened and saved without an edit. That is still a
    // save, so it succeeds, but Drizzle refuses an empty update and there is
    // no change to log.
    if (asksForNothing(sent)) return ok(rowToDefinition(current));

    // Only a new type or config can make a stored value invalid. A rename or a
    // reorder cannot, so neither reads every slot of the signup to find that
    // out. The check runs here, not before the transaction: every service that
    // writes slot values (adding, editing, the delete of a field) takes the
    // signup lock this holds, so a write that got in first has committed and
    // this read sees it, and none can start until this ends. Read before the
    // transaction, a value saved in between went unchecked and was left
    // invalid, and a date the new type refused silently stopped that slot's
    // reminders. The rows are read, not locked: the signup lock is what keeps
    // writers out, and a slot row lock would only make this wait for, and hold
    // up, people signing up.
    if (sent.fieldType !== undefined || sent.config !== undefined) {
      const slotRows = await tx
        .select({ id: slots.id, values: slots.values })
        .from(slots)
        .where(eq(slots.signupId, current.signupId));
      const nextDef: SlotFieldDefinition = {
        ...rowToDefinition(current),
        ...(sent.fieldType !== undefined ? { fieldType: sent.fieldType } : {}),
        ...(sent.config !== undefined ? { config: sent.config } : {}),
      };
      const offending: string[] = [];
      for (const row of slotRows) {
        const r = validateOneValue(nextDef, row.values[current.ref]);
        if (!r.ok) offending.push(row.id);
      }
      if (offending.length > 0) {
        return err(
          serviceError('conflict', 'change would invalidate existing slot values', {
            details: { slotIds: offending.slice(0, 20), count: offending.length },
          }),
        );
      }
    }

    const [row] = await tx
      .update(slotFields)
      .set({
        ...(sent.label !== undefined ? { label: sent.label } : {}),
        ...(sent.sortOrder !== undefined ? { sortOrder: sent.sortOrder } : {}),
        ...(sent.fieldType !== undefined ? { fieldType: sent.fieldType } : {}),
        ...(sent.config !== undefined ? { config: sent.config } : {}),
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
    //
    // Skipped when none of them can have: the rebuild locks every slot row, so
    // a rename on a live signup would queue behind everyone part-way through
    // signing up and then hold up everyone after them. The anchor and slot_at
    // read only the type and order of date and time fields
    // (src/lib/reminder-fields.ts), never a label, so a change that moves
    // neither, or a field that is not one of those before or after, is safe.
    // Asked of `sent`, so a type, config or position sent unchanged (every
    // builder rename) moves nothing. A changed config for a date or time field
    // rebuilds too: neither has options today, and one that arrives may well
    // move the instant.
    const feedsSlotAt = isDateOrTime(current.fieldType) || isDateOrTime(row.fieldType);
    const mayMoveSlotAt =
      sent.fieldType !== undefined || sent.sortOrder !== undefined || sent.config !== undefined;
    let anchor: string | null | undefined;
    if (feedsSlotAt && mayMoveSlotAt) {
      anchor = await syncAnchorAndSlotAt(tx, existing.signupId, existing.workspaceId);
    }

    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(sent) as (keyof typeof sent)[]) {
      changes[key] = sent[key];
    }
    await recordActivity(tx, {
      signupId: existing.signupId,
      workspaceId: existing.workspaceId,
      actor: activityActor(actor),
      eventType: 'field.updated',
      payload: {
        fieldId: row.id,
        ref: row.ref,
        changes,
        ...(anchor !== undefined ? { reminderFromFieldRef: anchor } : {}),
      },
    });
    return ok(rowToDefinition(row));
  });
}

/** A config sent with an update must be for the type the field ends up with. */
function configMismatch(data: SlotFieldUpdateInput, currentType: string): ServiceError | null {
  if (data.config === undefined) return null;
  if (data.config.fieldType === (data.fieldType ?? currentType)) return null;
  return serviceError('invalid_input', 'config.fieldType must match the field type');
}

/** Whether an update has nothing in it: no key, or only keys left undefined. */
function asksForNothing(data: SlotFieldUpdateInput): boolean {
  return Object.values(data).every((v) => v === undefined);
}

/**
 * `data` less any label, type, config or position the field already has.
 * Anything else is kept as sent.
 */
function withoutUnchanged(data: SlotFieldUpdateInput, row: FieldRow): SlotFieldUpdateInput {
  const { label, fieldType, config, sortOrder, ...rest } = data;
  return {
    ...rest,
    ...(label !== undefined && label !== row.label ? { label } : {}),
    ...(fieldType !== undefined && fieldType !== row.fieldType ? { fieldType } : {}),
    ...(config !== undefined && !sameJson(config, row.config) ? { config } : {}),
    ...(sortOrder !== undefined && sortOrder !== row.sortOrder ? { sortOrder } : {}),
  };
}

/**
 * Whether two JSON values say the same thing, compared by value. A config
 * sent is zod's output (keys in the schema's order, defaults filled in,
 * unknown keys dropped) and the row's is what jsonb hands back (keys in its
 * own storage order), so key order is ignored, and so is a key whose value is
 * undefined, which jsonb cannot hold. Array order counts: it is the order an
 * enum shows its choices in. Nothing is filled in on the row's side. A text
 * config saved without `maxLength` has no limit (`validateOneValue`), so the
 * same config with zod's default of 200 is a change, and is written.
 */
function sameJson(a: unknown, b: unknown): boolean {
  const sortedKeys = (_key: string, v: unknown): unknown =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : v;
  return JSON.stringify(a, sortedKeys) === JSON.stringify(b, sortedKeys);
}

export async function deleteField(
  db: Db,
  actor: Actor,
  fieldId: string,
): Promise<Result<{ deleted: true }, ServiceError>> {
  const existing = await readField(db, fieldId);
  if (!existing) return err(serviceError('not_found', 'field not found'));
  requireWorkspaceWrite(actor, existing.workspaceId);

  return db.transaction(async (tx) => {
    // Settings are read and rewritten inside the transaction, under the
    // signup lock: read outside it, a settings save landing in between would
    // be overwritten here with a stale copy. The lock also serialises the
    // re-anchor below against a concurrent add, retype or delete of a field
    // on the same signup: all three take it.
    const signupRow = await lockSignupForWrite(tx, existing.signupId, existing.workspaceId);
    if (!signupRow) return err(serviceError('not_found', 'signup not found'));
    const currentSettings = signupRow.settings;
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
    // Every slot row is written next. Locked in the shared order first, not
    // in whatever order the bulk update reaches them.
    await lockSlotsForSignup(tx, existing.signupId, existing.workspaceId);
    await tx
      .update(slots)
      .set({ values: sql`${slots.values} - ${existing.ref}::text` })
      .where(eq(slots.signupId, existing.signupId));
    await tx.delete(slotFields).where(eq(slotFields.id, fieldId));

    // Deleting the anchor moves it to the next date field (or drops it when
    // none is left); deleting a time field changes what pairs with the date;
    // and the values wipe above changes what every slot resolves to. Rebuild
    // unconditionally — gating this on "was it the anchor" missed the rest.
    const moved = await syncAnchorAndSlotAt(tx, existing.signupId, existing.workspaceId);

    await recordActivity(tx, {
      signupId: existing.signupId,
      workspaceId: existing.workspaceId,
      actor: activityActor(actor),
      eventType: 'field.deleted',
      payload: {
        fieldId,
        ref: existing.ref,
        ...(moved !== undefined ? { reminderFromFieldRef: moved } : {}),
        ...(removedFromGroupBy ? { removedFromGroupByFieldRefs: true } : {}),
      },
    });
    return ok({ deleted: true });
  });
}

export async function listFields(
  db: Db,
  actor: Actor,
  signupId: string,
): Promise<Result<SlotFieldDefinition[], ServiceError>> {
  const loaded = await getSignupRowForOrganizer(db, actor, signupId);
  if (!loaded.ok) return loaded;
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

// The date and time fields in the order src/lib/reminder-fields.ts reads them
// (ties go by ref), as one string. Two lists that give different strings pair
// a different time with the date, or anchor on a different date, so a tie the
// renumbering broke the other way counts as a move.
function timeline(fields: SlotFieldDefinition[]): string {
  return fields
    .filter((f) => isDateOrTime(f.fieldType))
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))
    .map((f) => f.id)
    .join(' ');
}

/** The only field types the reminder anchor and `slots.slot_at` are read from. */
function isDateOrTime(fieldType: string): boolean {
  return fieldType === 'date' || fieldType === 'time';
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
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
      const max =
        field.config.fieldType === 'text' ? field.config.maxLength : TEXT_DEFAULT_MAX_LENGTH;
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
      if (typeof value !== 'string' || !isCalendarDate(value)) {
        return err(
          serviceError('invalid_input', `"${field.ref}" must be a real date as YYYY-MM-DD`, {
            field: field.ref,
            received: value,
          }),
        );
      }
      if (!isRealDate(value)) {
        return err(
          serviceError(
            'invalid_input',
            `"${field.ref}" must be a date in ${MIN_DATE_YEAR} or later`,
            { field: field.ref, received: value },
          ),
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
 * Brings a signup's anchor and every slot's slot_at up to date after a field
 * change. Keeps `settings.reminderFromFieldRef` naming a real date field: left
 * alone while it names one of the signup's date fields, otherwise moved to the
 * first date field, or dropped when there is none. Then rebuilds slot_at from
 * those settings (`rebuildSlotAt`). The fields are listed once, and the
 * settings read once, under the signup lock the caller holds: taking it again
 * is just the read. Returns the ref the anchor moved to (null = dropped), or
 * undefined when it stayed. Must run inside the same transaction as the field
 * change.
 */
async function syncAnchorAndSlotAt(
  tx: Tx,
  signupId: string,
  workspaceId: string | null,
): Promise<string | null | undefined> {
  const signupRow = await lockSignupForWrite(tx, signupId, workspaceId);
  // Every caller has found the signup and holds its lock, so a miss is a wrong
  // id or workspace passed in. Carrying on would rewrite nothing and say so.
  if (!signupRow) throw new Error('anchor sync: signup not found under the lock');
  const fields = await listFieldsForSignup(tx, signupId);
  let settings = signupRow.settings;
  const next = resolveAnchorRef(settings, fields);
  let moved: string | null | undefined;
  if (next !== (settings.reminderFromFieldRef ?? null)) {
    const { reminderFromFieldRef: _stale, ...rest } = settings;
    settings = next === null ? rest : { ...rest, reminderFromFieldRef: next };
    await tx
      .update(signups)
      .set({ settings, updatedAt: new Date() })
      .where(eq(signups.id, signupId));
    moved = next;
  }
  await rebuildSlotAt(tx, signupId, workspaceId, settings, fields);
  return moved;
}
