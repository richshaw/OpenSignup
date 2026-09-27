import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { slotFields } from '@/db/schema/slot-fields';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { DEFAULT_TEMPLATE, EMPTY_TEMPLATE } from '@/lib/signup-templates';
import {
  addField,
  deleteField,
  listFields,
  listFieldsForSignup,
  recomputeSlotAtForSignup,
  updateField,
} from '@/services/slot-fields';
import { lockSignupForWrite, lockSlotsForSignup } from '@/services/locks';
import { addSlot, updateSlot } from '@/services/slots';
import { createSignup, updateSignup } from '@/services/signups';
import {
  settle,
  untilBlockedOn,
  untilServiceBlockedOn,
  whileSigningUp,
} from '@/services/testing/locks';

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  actor: Actor;
}

async function setupWorkspace(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const memberId = makeId('mem');
  const slug = `slot-fields-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Test Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Test Workspace',
      type: 'personal',
      plan: 'free',
    });
    await tx.insert(workspaceMembers).values({
      id: memberId,
      workspaceId,
      organizerId,
      role: 'owner',
      status: 'active',
    });
  });

  return {
    db,
    workspaceId,
    organizerId,
    actor: {
      kind: 'organizer',
      id: organizerId,
      email,
      workspaceIds: [workspaceId],
      workspaceRoles: { [workspaceId]: 'owner' },
    },
  };
}

async function teardown(fx: Fixture): Promise<void> {
  await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
  await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
}

async function createTestSignup(fx: Fixture, title = 'Field Test'): Promise<string> {
  const r = await createSignup(
    fx.db,
    fx.actor,
    fx.workspaceId,
    {
      title,
      description: '',
      tags: [],
      visibility: 'unlisted',
      settings: {},
    },
    { template: EMPTY_TEMPLATE },
  );
  if (!r.ok) throw new Error('signup setup failed');
  return r.value.id;
}

/** The row's xmin: any UPDATE changes it, one that writes the same values included. */
async function rowVersion(slotId: string): Promise<string | undefined> {
  const [row] = await getDb().execute<{ xmin: string }>(
    sql`select xmin::text as xmin from slots where id = ${slotId}`,
  );
  return row?.xmin;
}

describe('slot-fields service (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardown(fx);
  });

  describe('addField', () => {
    it('creates a field and records field.created activity', async () => {
      const sigId = await createTestSignup(fx, 'Add field happy');
      const r = await addField(fx.db, fx.actor, sigId, {
        ref: 'date',
        label: 'Date',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.ref).toBe('date');
      expect(r.value.fieldType).toBe('date');

      const acts = await fx.db.select().from(activity).where(eq(activity.signupId, sigId));
      expect(acts.some((a) => a.eventType === 'field.created')).toBe(true);
    });

    it('rejects duplicate ref within a signup', async () => {
      const sigId = await createTestSignup(fx, 'Dup ref');
      await addField(fx.db, fx.actor, sigId, {
        ref: 'teacher',
        label: 'Teacher',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      const second = await addField(fx.db, fx.actor, sigId, {
        ref: 'teacher',
        label: 'Teacher 2',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.error.code).toBe('conflict');
    });

    it('a second add of the same ref waits for the first, and is a conflict', async () => {
      const sigId = await createTestSignup(fx, 'Dup ref in flight');
      const input = {
        ref: 'teacher',
        label: 'Teacher',
        fieldType: 'text',
        config: { fieldType: 'text' },
      } as const;
      let second: ReturnType<typeof addField> | undefined;
      const held = fx.db.transaction(async (tx) => {
        const first = await addField(tx as unknown as Db, fx.actor, sigId, input);
        expect(first.ok, JSON.stringify(first)).toBe(true);
        // A double click, or an MCP retry: the first has not committed, so
        // nothing named `teacher` is there to see yet.
        second = addField(fx.db, fx.actor, sigId, input);
        await untilServiceBlockedOn(fx.db, tx, second);
      });
      await held.finally(() => settle(second));
      // Checked before the lock, this was the unique index's error, a 500.
      const r = await second!;
      expect(r.ok, JSON.stringify(r)).toBe(false);
      if (!r.ok) expect(r.error).toMatchObject({ code: 'conflict', field: 'ref' });
      const fields = await listFieldsForSignup(fx.db, sigId);
      expect(fields.map((f) => f.ref)).toEqual(['teacher']);
    });

    it('an add waiting behind the delete of a field with the same ref goes ahead', async () => {
      const sigId = await createTestSignup(fx, 'Re-add a deleted ref');
      const old = await addField(fx.db, fx.actor, sigId, {
        ref: 'teacher',
        label: 'Teacher',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      if (!old.ok) throw new Error('setup failed');
      let adding: ReturnType<typeof addField> | undefined;
      const held = fx.db.transaction(async (tx) => {
        const gone = await deleteField(tx as unknown as Db, fx.actor, old.value.id);
        expect(gone.ok, JSON.stringify(gone)).toBe(true);
        // Still sees the old `teacher`, since the delete has not committed.
        adding = addField(fx.db, fx.actor, sigId, {
          ref: 'teacher',
          label: 'Teacher (new)',
          fieldType: 'text',
          config: { fieldType: 'text' },
        });
        await untilServiceBlockedOn(fx.db, tx, adding);
      });
      await held.finally(() => settle(adding));
      // Checked before the lock, the old field was still there: a conflict.
      const r = await adding!;
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const fields = await listFieldsForSignup(fx.db, sigId);
      expect(fields.map((f) => f.label)).toEqual(['Teacher (new)']);
    });

    it('rejects invalid input via Zod', async () => {
      const sigId = await createTestSignup(fx, 'Bad input');
      const r = await addField(fx.db, fx.actor, sigId, {
        ref: 'NotKebab',
        label: 'X',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');
    });

    it('rejects creation in a signup the actor cannot access', async () => {
      const otherFx = await setupWorkspace();
      try {
        const sigId = await createTestSignup(otherFx, 'Other org');
        await expect(
          addField(fx.db, fx.actor, sigId, {
            ref: 'x',
            label: 'X',
            fieldType: 'text',
            config: { fieldType: 'text' },
          }),
        ).rejects.toThrow(/not a member/);
      } finally {
        await teardown(otherFx);
      }
    });

    it('appends when sortOrder is omitted', async () => {
      // Regression: the build page adds fields without a sortOrder. While the
      // input schema defaulted that to 0, the new field sorted ahead of
      // the template's date column (DEFAULT_TEMPLATE pins it at 1) and
      // reappeared mid-grid after a reload. This signup starts empty, so the
      // first field is placed explicitly and the second must land after it.
      const sigId = await createTestSignup(fx, 'Append not prepend');
      const first = await addField(fx.db, fx.actor, sigId, {
        ref: 'first',
        label: 'First',
        fieldType: 'text',
        config: { fieldType: 'text' },
        sortOrder: 1,
      });
      if (!first.ok) throw new Error('first field setup failed');

      // No sortOrder, exactly as useBuildState.addField sends it.
      const added = await addField(fx.db, fx.actor, sigId, {
        ref: 'added',
        label: 'Added',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      expect(added.ok).toBe(true);
      if (!added.ok) return;
      expect(added.value.sortOrder).toBeGreaterThan(first.value.sortOrder);

      const listed = await listFields(fx.db, fx.actor, sigId);
      if (!listed.ok) throw new Error('list failed');
      expect(listed.value.map((f) => f.ref)).toEqual(['first', 'added']);
    });

    it('does not deadlock with someone signing up for a slot whose slot_at changes', async () => {
      const sigId = await createTestSignup(fx, 'Add commit race');
      for (const [ref, fieldType] of [['doors', 'time'], ['day', 'date']] as const) {
        const f = await addField(fx.db, fx.actor, sigId, {
          ref,
          label: ref,
          fieldType,
          config: { fieldType },
        });
        if (!f.ok) throw new Error(`${ref} setup failed`);
      }
      const slot = await addSlot(fx.db, fx.actor, sigId, {
        values: { doors: '18:30', day: '2026-05-10' },
      });
      if (!slot.ok) throw new Error('slot setup failed');
      expect(slot.value.slotAt?.toISOString()).toBe('2026-05-10T18:30:00.000Z');

      // A time field after the date pairs with it in place of `doors`, and the
      // slot has no value for it, so the add rewrites the slot row.
      const at = { signupId: sigId, workspaceId: fx.workspaceId, slotId: slot.value.id };
      const r = await whileSigningUp(fx.db, at, () =>
        addField(fx.db, fx.actor, sigId, {
          ref: 'start',
          label: 'Start',
          fieldType: 'time',
          config: { fieldType: 'time' },
        }),
      );
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const [after] = await fx.db.select().from(slots).where(eq(slots.id, slot.value.id)).limit(1);
      expect(after?.slotAt?.toISOString()).toBe('2026-05-10T12:00:00.000Z');
    });

    it('rebuilds slot_at from the date a slot edit in flight ends up saving', async () => {
      const sigId = await createTestSignup(fx, 'Add slot-edit race');
      for (const [ref, fieldType] of [['doors', 'time'], ['day', 'date']] as const) {
        const f = await addField(fx.db, fx.actor, sigId, {
          ref,
          label: ref,
          fieldType,
          config: { fieldType },
        });
        if (!f.ok) throw new Error(`${ref} setup failed`);
      }
      const slot = await addSlot(fx.db, fx.actor, sigId, {
        values: { doors: '18:30', day: '2026-05-10' },
      });
      if (!slot.ok) throw new Error('slot setup failed');

      let adding: ReturnType<typeof addField> | undefined;
      const held = fx.db.transaction(async (tx) => {
        // What `updateSlot` does, held open: lock the signup, then the slot,
        // and move the slot to July.
        await tx.select().from(signups).where(eq(signups.id, sigId)).for('no key update');
        await tx.select().from(slots).where(eq(slots.id, slot.value.id)).for('update');
        await tx
          .update(slots)
          .set({
            values: { doors: '18:30', day: '2026-07-04' },
            slotAt: new Date('2026-07-04T18:30:00.000Z'),
          })
          .where(eq(slots.id, slot.value.id));
        // `start` pairs with the date in place of `doors`, so the rebuild has
        // a new instant to write for this slot whichever date it read.
        adding = addField(fx.db, fx.actor, sigId, {
          ref: 'start',
          label: 'Start',
          fieldType: 'time',
          config: { fieldType: 'time' },
        });
        await untilServiceBlockedOn(fx.db, tx, adding);
      });
      await held.finally(() => settle(adding));
      const r = await adding!;
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const [after] = await fx.db.select().from(slots).where(eq(slots.id, slot.value.id)).limit(1);
      expect((after?.values as { day?: string }).day).toBe('2026-07-04');
      expect(after?.slotAt?.toISOString()).toBe('2026-07-04T12:00:00.000Z');
    });

    it('with a sortOrder, waits for a settings save in flight and keeps what it saved', async () => {
      const sigId = await createTestSignup(fx, 'Add settings race');
      let adding: ReturnType<typeof addField> | undefined;
      const held = fx.db.transaction(async (tx) => {
        // What `updateSignup` does, held open: lock the signup, save a setting.
        await tx.select().from(signups).where(eq(signups.id, sigId)).for('no key update');
        await tx
          .update(signups)
          .set({ settings: { sendReminders: false } })
          .where(eq(signups.id, sigId));
        // The signup's first date field, so the add re-anchors and writes
        // settings too. The explicit sortOrder is the path that took no lock.
        adding = addField(fx.db, fx.actor, sigId, {
          ref: 'day',
          label: 'Day',
          fieldType: 'date',
          sortOrder: 3,
          config: { fieldType: 'date' },
        });
        await untilServiceBlockedOn(fx.db, tx, adding);
      });
      await held.finally(() => settle(adding));
      const r = await adding!;
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const [after] = await fx.db.select().from(signups).where(eq(signups.id, sigId)).limit(1);
      expect(after?.settings).toMatchObject({ sendReminders: false, reminderFromFieldRef: 'day' });
    });

    it('returns not_found when the signup row is gone by the time it has the lock', async () => {
      const sigId = await createTestSignup(fx, 'Add hard-delete race');
      let adding: ReturnType<typeof addField> | undefined;
      const held = fx.db.transaction(async (tx) => {
        // No service removes the row; this is the lock coming back empty.
        await tx.delete(signups).where(eq(signups.id, sigId));
        adding = addField(fx.db, fx.actor, sigId, {
          ref: 'day',
          label: 'Day',
          fieldType: 'date',
          config: { fieldType: 'date' },
        });
        await untilServiceBlockedOn(fx.db, tx, adding);
      });
      await held.finally(() => settle(adding));
      const r = await adding!;
      expect(r.ok, JSON.stringify(r)).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('not_found');
    });
  });

  describe('the lock helpers', () => {
    it('return rows for their own workspace and nothing for any other', async () => {
      const sigId = await createTestSignup(fx, 'Lock workspace scope');
      const slot = await addSlot(fx.db, fx.actor, sigId, { values: {} });
      if (!slot.ok) throw new Error('slot setup failed');
      await fx.db.transaction(async (tx) => {
        expect((await lockSignupForWrite(tx, sigId, fx.workspaceId))?.id).toBe(sigId);
        expect(await lockSignupForWrite(tx, sigId, makeId('ws'))).toBeUndefined();
        expect(await lockSignupForWrite(tx, sigId, null)).toBeUndefined();

        const locked = await lockSlotsForSignup(tx, sigId, fx.workspaceId);
        expect(locked.map((s) => s.id)).toEqual([slot.value.id]);
        expect(await lockSlotsForSignup(tx, sigId, makeId('ws'))).toEqual([]);
        expect(await lockSlotsForSignup(tx, sigId, null)).toEqual([]);
      });
    });
  });

  describe('updateField', () => {
    it('updates label and records activity', async () => {
      const sigId = await createTestSignup(fx, 'Label update');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'note',
        label: 'Note',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      if (!created.ok) throw new Error('setup failed');
      const r = await updateField(fx.db, fx.actor, created.value.id, { label: 'Updated' });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.label).toBe('Updated');
    });

    it('renames a field without waiting for someone part-way through signing up', async () => {
      const sigId = await createTestSignup(fx, 'Rename while committing');
      const day = await addField(fx.db, fx.actor, sigId, {
        ref: 'day',
        label: 'Day',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      if (!day.ok) throw new Error('setup failed');
      const slot = await addSlot(fx.db, fx.actor, sigId, { values: { day: '2026-05-10' } });
      if (!slot.ok) throw new Error('slot setup failed');

      let renaming: ReturnType<typeof updateField> | undefined;
      let outcome: string | undefined;
      await fx.db.transaction(async (tx) => {
        // What `commitToSlot` does, held open: lock the slot row.
        await tx.select().from(slots).where(eq(slots.id, slot.value.id)).for('update');
        renaming = updateField(fx.db, fx.actor, day.value.id, { label: 'Date' });
        renaming.catch(() => undefined);
        // A label cannot move slot_at, so the rename has no business with the
        // slot rows and must finish while this one is still held.
        outcome = await Promise.race([
          renaming.then((r) => (r.ok ? 'renamed' : JSON.stringify(r))),
          untilBlockedOn(fx.db, tx, 5_000).then(
            () => 'blocked behind the slot row',
            () => 'neither finished nor blocked',
          ),
        ]);
      });
      // Let a blocked rename finish before the next test or the teardown runs.
      await renaming;
      expect(outcome).toBe('renamed');
    });

    it('does not deadlock with someone signing up for a slot whose slot_at changes', async () => {
      const sigId = await createTestSignup(fx, 'Reorder commit race');
      const ids: Record<string, string> = {};
      for (const [ref, fieldType] of [
        ['doors', 'time'],
        ['day', 'date'],
        ['start', 'time'],
      ] as const) {
        const f = await addField(fx.db, fx.actor, sigId, {
          ref,
          label: ref,
          fieldType,
          config: { fieldType },
        });
        if (!f.ok) throw new Error(`${ref} setup failed`);
        ids[ref] = f.value.id;
      }
      // `start` sorts after the date, so it is the time that pairs with it,
      // and this slot leaves it blank.
      const slot = await addSlot(fx.db, fx.actor, sigId, {
        values: { doors: '18:30', day: '2026-05-10' },
      });
      if (!slot.ok) throw new Error('slot setup failed');
      expect(slot.value.slotAt?.toISOString()).toBe('2026-05-10T12:00:00.000Z');

      // Moved ahead of the date, no time is left after it and the first one,
      // `doors`, pairs instead: the reorder rewrites the slot row.
      const at = { signupId: sigId, workspaceId: fx.workspaceId, slotId: slot.value.id };
      const r = await whileSigningUp(fx.db, at, () =>
        updateField(fx.db, fx.actor, ids['start']!, { sortOrder: 0 }),
      );
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const [after] = await fx.db.select().from(slots).where(eq(slots.id, slot.value.id)).limit(1);
      expect(after?.slotAt?.toISOString()).toBe('2026-05-10T18:30:00.000Z');
    });

    it('waits for a settings save in flight and keeps what it saved', async () => {
      const sigId = await createTestSignup(fx, 'Retype settings race');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'day',
        label: 'Day',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      if (!created.ok) throw new Error('setup failed');

      let retyping: ReturnType<typeof updateField> | undefined;
      const held = fx.db.transaction(async (tx) => {
        // What `updateSignup` does, held open: lock the signup, save a setting.
        await tx.select().from(signups).where(eq(signups.id, sigId)).for('no key update');
        await tx
          .update(signups)
          .set({ settings: { sendReminders: false } })
          .where(eq(signups.id, sigId));
        // Retyping to the signup's first date field re-anchors, which writes
        // settings too.
        retyping = updateField(fx.db, fx.actor, created.value.id, {
          fieldType: 'date',
          config: { fieldType: 'date' },
        });
        await untilServiceBlockedOn(fx.db, tx, retyping);
      });
      await held.finally(() => settle(retyping));
      const r = await retyping!;
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const [after] = await fx.db.select().from(signups).where(eq(signups.id, sigId)).limit(1);
      expect(after?.settings).toMatchObject({ sendReminders: false, reminderFromFieldRef: 'day' });
    });

    it('returns not_found when the field is deleted while it waits for the lock', async () => {
      const sigId = await createTestSignup(fx, 'Update delete race');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'note',
        label: 'Note',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      if (!created.ok) throw new Error('setup failed');

      let renaming: ReturnType<typeof updateField> | undefined;
      const held = fx.db.transaction(async (tx) => {
        // What `deleteField` does, held open: lock the signup, delete the field.
        await tx.select().from(signups).where(eq(signups.id, sigId)).for('no key update');
        await tx.delete(slotFields).where(eq(slotFields.id, created.value.id));
        // Still sees the field, since the delete has not committed.
        renaming = updateField(fx.db, fx.actor, created.value.id, { label: 'Notes' });
        await untilServiceBlockedOn(fx.db, tx, renaming);
      });
      await held.finally(() => settle(renaming));
      const r = await renaming!;
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('not_found');
    });

    it('checks a config against the type a retype in flight leaves the field with', async () => {
      const sigId = await createTestSignup(fx, 'Update retype race');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'note',
        label: 'Note',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      if (!created.ok) throw new Error('setup failed');

      let configuring: ReturnType<typeof updateField> | undefined;
      const held = fx.db.transaction(async (tx) => {
        // What another `updateField` does, held open: lock the signup, retype.
        await tx.select().from(signups).where(eq(signups.id, sigId)).for('no key update');
        await tx
          .update(slotFields)
          .set({ fieldType: 'number', config: { fieldType: 'number' } })
          .where(eq(slotFields.id, created.value.id));
        // Fine for the text field this call can still see.
        configuring = updateField(fx.db, fx.actor, created.value.id, {
          config: { fieldType: 'text', maxLength: 50 },
        });
        await untilServiceBlockedOn(fx.db, tx, configuring);
      });
      await held.finally(() => settle(configuring));
      const r = await configuring!;
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');

      const [after] = await fx.db
        .select()
        .from(slotFields)
        .where(eq(slotFields.id, created.value.id))
        .limit(1);
      expect(after?.config).toEqual({ fieldType: 'number' });
    });

    it('rejects ref rename (extra key in update payload)', async () => {
      const sigId = await createTestSignup(fx, 'No rename');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'date',
        label: 'Date',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      if (!created.ok) throw new Error('setup failed');
      const r = await updateField(fx.db, fx.actor, created.value.id, {
        ref: 'newref',
      } as unknown as Record<string, unknown>);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');
    });

    it('rejects tightening enum choices that drops an in-use value', async () => {
      const sigId = await createTestSignup(fx, 'Tighten enum');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'subject',
        label: 'Subject',
        fieldType: 'enum',
        config: { fieldType: 'enum', choices: ['Math', 'Science'] },
      });
      if (!created.ok) throw new Error('setup failed');
      const slotR = await addSlot(fx.db, fx.actor, sigId, {
        values: { subject: 'Science' },
      });
      if (!slotR.ok) throw new Error('slot setup failed');

      const r = await updateField(fx.db, fx.actor, created.value.id, {
        fieldType: 'enum',
        config: { fieldType: 'enum', choices: ['Math'] },
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('conflict');
    });

    it('checks stored values against a slot add in flight', async () => {
      const sigId = await createTestSignup(fx, 'Tighten enum during add');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'subject',
        label: 'Subject',
        fieldType: 'enum',
        config: { fieldType: 'enum', choices: ['Math', 'Science'] },
      });
      if (!created.ok) throw new Error('setup failed');

      let tightening: ReturnType<typeof updateField> | undefined;
      const held = fx.db.transaction(async (tx) => {
        const added = await addSlot(tx as unknown as Db, fx.actor, sigId, {
          values: { subject: 'Science' },
        });
        expect(added.ok, JSON.stringify(added)).toBe(true);
        // Cannot see the new slot, since the add has not committed.
        tightening = updateField(fx.db, fx.actor, created.value.id, {
          fieldType: 'enum',
          config: { fieldType: 'enum', choices: ['Math'] },
        });
        await untilServiceBlockedOn(fx.db, tx, tightening);
      });
      await held.finally(() => settle(tightening));
      const r = await tightening!;
      expect(r.ok, JSON.stringify(r)).toBe(false);
      if (!r.ok) expect(r.error).toMatchObject({ code: 'conflict', details: { count: 1 } });
      const [field] = await fx.db
        .select()
        .from(slotFields)
        .where(eq(slotFields.id, created.value.id));
      expect(field?.config).toEqual({ fieldType: 'enum', choices: ['Math', 'Science'] });
    });

    it('checks stored values against a slot edit in flight', async () => {
      const sigId = await createTestSignup(fx, 'Retype during edit');
      const when = await addField(fx.db, fx.actor, sigId, {
        ref: 'when',
        label: 'When',
        fieldType: 'text',
        config: { fieldType: 'text', maxLength: 200 },
      });
      if (!when.ok) throw new Error('setup failed');
      const slot = await addSlot(fx.db, fx.actor, sigId, { values: { when: '2026-05-10' } });
      if (!slot.ok) throw new Error('slot setup failed');

      let retyping: ReturnType<typeof updateField> | undefined;
      const held = fx.db.transaction(async (tx) => {
        const edited = await updateSlot(tx as unknown as Db, fx.actor, slot.value.id, {
          values: { when: 'Sat 9am' },
        });
        expect(edited.ok, JSON.stringify(edited)).toBe(true);
        // Still sees a date in every slot, since the edit has not committed.
        retyping = updateField(fx.db, fx.actor, when.value.id, {
          fieldType: 'date',
          config: { fieldType: 'date' },
        });
        await untilServiceBlockedOn(fx.db, tx, retyping);
      });
      await held.finally(() => settle(retyping));
      const r = await retyping!;
      // Let through, the field became the reminder anchor with "Sat 9am" in
      // it: slot_at went null and this slot's reminders stopped, unannounced.
      expect(r.ok, JSON.stringify(r)).toBe(false);
      if (!r.ok) {
        expect(r.error).toMatchObject({ code: 'conflict' });
        expect(r.error.details).toMatchObject({ slotIds: [slot.value.id] });
      }
      const [field] = await fx.db.select().from(slotFields).where(eq(slotFields.id, when.value.id));
      expect(field?.fieldType).toBe('text');
    });

    it('checks stored values without waiting for someone part-way through signing up', async () => {
      const sigId = await createTestSignup(fx, 'Field saves while committing');
      const config = { fieldType: 'enum', choices: ['Math', 'Science'] } as const;
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'subject',
        label: 'Subject',
        fieldType: 'enum',
        config,
      });
      if (!created.ok) throw new Error('setup failed');
      const slot = await addSlot(fx.db, fx.actor, sigId, { values: { subject: 'Science' } });
      if (!slot.ok) throw new Error('slot setup failed');

      // What the builder's Fields dialog sends for a rename (the type and
      // config come along unchanged), and a choice added from a slot's cell.
      const saves = [
        { label: 'Class', fieldType: 'enum', config },
        { fieldType: 'enum', config: { ...config, choices: [...config.choices, 'Music'] } },
      ];
      const outcomes: string[] = [];
      const pending: Promise<unknown>[] = [];
      await fx.db.transaction(async (tx) => {
        // What `commitToSlot` does, held open: lock the slot row.
        await tx.select().from(slots).where(eq(slots.id, slot.value.id)).for('update');
        for (const save of saves) {
          const saving = updateField(fx.db, fx.actor, created.value.id, save);
          pending.push(saving.catch(() => undefined));
          // Neither can make the stored value invalid, and the check only
          // reads the slot rows, so both finish while this one is still held.
          outcomes.push(
            await Promise.race([
              saving.then((r) => (r.ok ? 'saved' : JSON.stringify(r))),
              untilBlockedOn(fx.db, tx, 5_000).then(
                () => 'blocked behind the slot row',
                () => 'neither finished nor blocked',
              ),
            ]),
          );
        }
      });
      // Let a blocked save finish before the next test or the teardown runs.
      await Promise.all(pending);
      expect(outcomes).toEqual(['saved', 'saved']);
    });

    it('does not check stored values for a rename or a reorder', async () => {
      const sigId = await createTestSignup(fx, 'Rename skips the scan');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'subject',
        label: 'Subject',
        fieldType: 'enum',
        config: { fieldType: 'enum', choices: ['Math', 'Science'] },
      });
      if (!created.ok) throw new Error('setup failed');
      const slotR = await addSlot(fx.db, fx.actor, sigId, { values: { subject: 'Science' } });
      if (!slotR.ok) throw new Error('slot setup failed');
      // A value the field would refuse today, as an older write could have left
      // it. Only a type or config change has any business tripping over it.
      await fx.db
        .update(slots)
        .set({ values: { subject: 'Art' } })
        .where(eq(slots.id, slotR.value.id));

      const renamed = await updateField(fx.db, fx.actor, created.value.id, { label: 'Class' });
      expect(renamed.ok, JSON.stringify(renamed)).toBe(true);
      const moved = await updateField(fx.db, fx.actor, created.value.id, { sortOrder: 5 });
      expect(moved.ok, JSON.stringify(moved)).toBe(true);

      const retyped = await updateField(fx.db, fx.actor, created.value.id, {
        fieldType: 'enum',
        config: { fieldType: 'enum', choices: ['Math', 'Science', 'Music'] },
      });
      expect(retyped.ok).toBe(false);
      if (retyped.ok) return;
      expect(retyped.error.code).toBe('conflict');
    });
  });

  describe('deleteField', () => {
    it('deletes a field with stored slot values and clears those values from all slots', async () => {
      const sigId = await createTestSignup(fx, 'Delete clears values');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'teacher',
        label: 'Teacher',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      if (!created.ok) throw new Error('setup failed');
      const slotR = await addSlot(fx.db, fx.actor, sigId, {
        values: { teacher: 'Ms. J' },
      });
      if (!slotR.ok) throw new Error('slot setup failed');

      const r = await deleteField(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(true);

      const [after] = await fx.db.select().from(slots).where(eq(slots.id, slotR.value.id)).limit(1);
      const values = (after?.values ?? {}) as Record<string, unknown>;
      expect(values['teacher']).toBeUndefined();
    });

    it('deletes a field with no stored values', async () => {
      const sigId = await createTestSignup(fx, 'Delete ok');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'unused',
        label: 'Unused',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      if (!created.ok) throw new Error('setup failed');
      const r = await deleteField(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(true);

      const acts = await fx.db.select().from(activity).where(eq(activity.signupId, sigId));
      expect(acts.some((a) => a.eventType === 'field.deleted')).toBe(true);
    });

    it('clears reminderFromFieldRef in signup settings when the referenced field is deleted', async () => {
      const sigId = await createTestSignup(fx, 'Delete clears reminder');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'deadline',
        label: 'Deadline',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      if (!created.ok) throw new Error('field setup failed');
      const upd = await updateSignup(fx.db, fx.actor, sigId, {
        settings: { reminderFromFieldRef: 'deadline' },
      });
      if (!upd.ok) throw new Error('settings setup failed');

      const r = await deleteField(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(true);

      const [after] = await fx.db.select().from(signups).where(eq(signups.id, sigId)).limit(1);
      const settings = (after?.settings ?? {}) as { reminderFromFieldRef?: string };
      expect(settings.reminderFromFieldRef).toBeUndefined();
    });

    it('removes the deleted field ref from groupByFieldRefs', async () => {
      const sigId = await createTestSignup(fx, 'Delete removes groupBy');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'category',
        label: 'Category',
        fieldType: 'enum',
        config: { fieldType: 'enum', choices: ['A', 'B'] },
      });
      if (!created.ok) throw new Error('field setup failed');
      const upd = await updateSignup(fx.db, fx.actor, sigId, {
        settings: { groupByFieldRefs: ['category'] },
      });
      if (!upd.ok) throw new Error('settings setup failed');

      const r = await deleteField(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(true);

      const [after] = await fx.db.select().from(signups).where(eq(signups.id, sigId)).limit(1);
      const settings = (after?.settings ?? {}) as { groupByFieldRefs?: string[] };
      expect(settings.groupByFieldRefs ?? []).toEqual([]);
    });

    it('recomputes slot_at on remaining slots after the configured date field is deleted', async () => {
      const sigId = await createTestSignup(fx, 'Delete recomputes slot_at');
      const fldA = await addField(fx.db, fx.actor, sigId, {
        ref: 'field-a',
        label: 'Field A',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      if (!fldA.ok) throw new Error('field-a setup failed');
      const fldB = await addField(fx.db, fx.actor, sigId, {
        ref: 'field-b',
        label: 'Field B',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      if (!fldB.ok) throw new Error('field-b setup failed');
      const upd = await updateSignup(fx.db, fx.actor, sigId, {
        settings: { reminderFromFieldRef: 'field-a' },
      });
      if (!upd.ok) throw new Error('settings setup failed');

      const slot = await addSlot(fx.db, fx.actor, sigId, {
        values: { 'field-b': '2026-06-15' },
      });
      if (!slot.ok) throw new Error('slot setup failed');
      expect(slot.value.slotAt).toBeNull();

      const r = await deleteField(fx.db, fx.actor, fldA.value.id);
      expect(r.ok).toBe(true);

      const [after] = await fx.db.select().from(slots).where(eq(slots.id, slot.value.id)).limit(1);
      expect(after?.slotAt?.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    });

    it('does not deadlock with someone signing up for one of the slots', async () => {
      const sigId = await createTestSignup(fx, 'Delete commit race');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'teacher',
        label: 'Teacher',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      if (!created.ok) throw new Error('setup failed');
      const slot = await addSlot(fx.db, fx.actor, sigId, { values: { teacher: 'Ms. J' } });
      if (!slot.ok) throw new Error('slot setup failed');

      const at = { signupId: sigId, workspaceId: fx.workspaceId, slotId: slot.value.id };
      const r = await whileSigningUp(fx.db, at, () =>
        deleteField(fx.db, fx.actor, created.value.id),
      );
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const [after] = await fx.db.select().from(slots).where(eq(slots.id, slot.value.id)).limit(1);
      expect((after?.values ?? {}) as Record<string, unknown>).toEqual({});
    });
  });

  describe('recomputeSlotAtForSignup', () => {
    it('writes only the slots that move, to a new instant or to none, in one pass', async () => {
      const sigId = await createTestSignup(fx, 'Rebuild in one statement');
      for (const [ref, fieldType] of [
        ['day', 'date'],
        ['day2', 'date'],
        ['start', 'time'],
      ] as const) {
        const f = await addField(fx.db, fx.actor, sigId, {
          ref,
          label: ref,
          fieldType,
          config: { fieldType },
        });
        if (!f.ok) throw new Error(`${ref} setup failed`);
      }
      const add = async (values: Record<string, string>) => {
        const r = await addSlot(fx.db, fx.actor, sigId, { values });
        if (!r.ok) throw new Error('slot setup failed');
        return r.value.id;
      };
      const moves = await add({ day: '2026-05-10', day2: '2026-07-04', start: '09:30' });
      const clears = await add({ day: '2026-05-11' });
      const stays = await add({ day: '2026-05-12', day2: '2026-05-12', start: '18:00' });
      const at = async (id: string) =>
        (await fx.db.select().from(slots).where(eq(slots.id, id)))[0]?.slotAt?.toISOString() ??
        null;
      expect(await at(clears)).toBe('2026-05-11T12:00:00.000Z');
      const untouched = await rowVersion(stays);

      const r = await fx.db.transaction(async (tx) => {
        // Move the anchor underneath the rebuild, as updateSignup does.
        await tx
          .update(signups)
          .set({ settings: { reminderFromFieldRef: 'day2' } })
          .where(eq(signups.id, sigId));
        return recomputeSlotAtForSignup(tx, sigId, fx.workspaceId);
      });
      expect(r).toEqual({ updated: 2 });
      expect(await at(moves)).toBe('2026-07-04T09:30:00.000Z');
      expect(await at(clears)).toBeNull();
      expect(await at(stays)).toBe('2026-05-12T18:00:00.000Z');
      expect(await rowVersion(stays)).toBe(untouched);
    });

    it('writes nothing when no slot moves, a year below 100 included', async () => {
      const sigId = await createTestSignup(fx, 'Rebuild with nothing to do');
      const day = await addField(fx.db, fx.actor, sigId, {
        ref: 'day',
        label: 'Day',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      if (!day.ok) throw new Error('setup failed');
      const ids: string[] = [];
      // The driver reads 0099-12-31 back as 1999-12-31, so the check in JS
      // sees that slot move on every rebuild; Postgres sees that it has not.
      for (const date of ['2026-05-10', '0099-12-31']) {
        const slot = await addSlot(fx.db, fx.actor, sigId, { values: { day: date } });
        if (!slot.ok) throw new Error('slot setup failed');
        ids.push(slot.value.id);
      }
      const before = await Promise.all(ids.map(rowVersion));
      const r = await fx.db.transaction((tx) =>
        recomputeSlotAtForSignup(tx, sigId, fx.workspaceId),
      );
      expect(r).toEqual({ updated: 0 });
      expect(await Promise.all(ids.map(rowVersion))).toEqual(before);
    });
  });

  describe('updateSignup recomputes slot_at', () => {
    it('updates slot_at on existing slots when reminderFromFieldRef changes', async () => {
      const sigId = await createTestSignup(fx, 'Reminder ref change');
      const fldA = await addField(fx.db, fx.actor, sigId, {
        ref: 'field-a',
        label: 'Field A',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      if (!fldA.ok) throw new Error('field-a setup failed');
      const fldB = await addField(fx.db, fx.actor, sigId, {
        ref: 'field-b',
        label: 'Field B',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      if (!fldB.ok) throw new Error('field-b setup failed');

      const settingsA = await updateSignup(fx.db, fx.actor, sigId, {
        settings: { reminderFromFieldRef: 'field-a' },
      });
      if (!settingsA.ok) throw new Error('settings setup failed');

      const slot = await addSlot(fx.db, fx.actor, sigId, {
        values: { 'field-a': '2026-05-10', 'field-b': '2026-06-15' },
      });
      if (!slot.ok) throw new Error('slot setup failed');
      expect(slot.value.slotAt?.toISOString()).toBe('2026-05-10T12:00:00.000Z');

      const settingsB = await updateSignup(fx.db, fx.actor, sigId, {
        settings: { reminderFromFieldRef: 'field-b' },
      });
      expect(settingsB.ok).toBe(true);

      const [after] = await fx.db.select().from(slots).where(eq(slots.id, slot.value.id)).limit(1);
      expect(after?.slotAt?.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    });

    it('does not deadlock with someone signing up for a slot whose slot_at changes', async () => {
      const sigId = await createTestSignup(fx, 'Settings commit race');
      for (const ref of ['field-a', 'field-b']) {
        const f = await addField(fx.db, fx.actor, sigId, {
          ref,
          label: ref,
          fieldType: 'date',
          config: { fieldType: 'date' },
        });
        if (!f.ok) throw new Error(`${ref} setup failed`);
      }
      const slot = await addSlot(fx.db, fx.actor, sigId, {
        values: { 'field-a': '2026-05-10', 'field-b': '2026-06-15' },
      });
      if (!slot.ok) throw new Error('slot setup failed');
      expect(slot.value.slotAt?.toISOString()).toBe('2026-05-10T12:00:00.000Z');

      const at = { signupId: sigId, workspaceId: fx.workspaceId, slotId: slot.value.id };
      const r = await whileSigningUp(fx.db, at, () =>
        updateSignup(fx.db, fx.actor, sigId, { settings: { reminderFromFieldRef: 'field-b' } }),
      );
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const [after] = await fx.db.select().from(slots).where(eq(slots.id, slot.value.id)).limit(1);
      expect(after?.slotAt?.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    });
  });

  describe('reminder anchor maintenance', () => {
    async function anchorOf(sigId: string): Promise<string | undefined> {
      const [row] = await fx.db.select().from(signups).where(eq(signups.id, sigId)).limit(1);
      return ((row?.settings ?? {}) as { reminderFromFieldRef?: string }).reminderFromFieldRef;
    }

    it('anchors a signup on the first date field it gains', async () => {
      const sigId = await createTestSignup(fx, 'First date anchors');
      expect(await anchorOf(sigId)).toBeUndefined();

      const slot = await addSlot(fx.db, fx.actor, sigId, { values: {} });
      if (!slot.ok) throw new Error('slot setup failed');

      const when = await addField(fx.db, fx.actor, sigId, {
        ref: 'when',
        label: 'When',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      expect(when.ok).toBe(true);
      expect(await anchorOf(sigId)).toBe('when');

      // The anchor is live: a value written to the new column becomes slot_at.
      const edited = await updateSlot(fx.db, fx.actor, slot.value.id, {
        values: { when: '2026-06-15' },
      });
      expect(edited.ok).toBe(true);
      expect(edited.ok && edited.value.slotAt?.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    });

    it('leaves the anchor alone when a second date field is added', async () => {
      const sigId = await createTestSignup(fx, 'Second date is inert');
      const first = await addField(fx.db, fx.actor, sigId, {
        ref: 'first',
        label: 'First',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      if (!first.ok) throw new Error('first setup failed');
      const second = await addField(fx.db, fx.actor, sigId, {
        ref: 'second',
        label: 'Second',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      expect(second.ok).toBe(true);
      expect(await anchorOf(sigId)).toBe('first');
    });

    it('moves the anchor to the next date field when its own is retyped', async () => {
      const sigId = await createTestSignup(fx, 'Retype moves anchor');
      const a = await addField(fx.db, fx.actor, sigId, {
        ref: 'a',
        label: 'A',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      const b = await addField(fx.db, fx.actor, sigId, {
        ref: 'b',
        label: 'B',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      if (!a.ok || !b.ok) throw new Error('field setup failed');
      const slot = await addSlot(fx.db, fx.actor, sigId, {
        values: { a: '2026-05-10', b: '2026-06-15' },
      });
      if (!slot.ok) throw new Error('slot setup failed');
      expect(slot.value.slotAt?.toISOString()).toBe('2026-05-10T12:00:00.000Z');

      const retyped = await updateField(fx.db, fx.actor, a.value.id, {
        fieldType: 'text',
        config: { fieldType: 'text', maxLength: 200 },
      });
      expect(retyped.ok).toBe(true);
      expect(await anchorOf(sigId)).toBe('b');

      const [after] = await fx.db.select().from(slots).where(eq(slots.id, slot.value.id)).limit(1);
      expect(after?.slotAt?.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    });

    it('rebuilds slot_at when a time field is deleted, not only the date field', async () => {
      const sigId = await createTestSignup(fx, 'Time delete rebuilds');
      const day = await addField(fx.db, fx.actor, sigId, {
        ref: 'day',
        label: 'Day',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      const at = await addField(fx.db, fx.actor, sigId, {
        ref: 'at',
        label: 'At',
        fieldType: 'time',
        config: { fieldType: 'time' },
      });
      if (!day.ok || !at.ok) throw new Error('field setup failed');
      const slot = await addSlot(fx.db, fx.actor, sigId, {
        values: { day: '2026-06-15', at: '09:30' },
      });
      if (!slot.ok) throw new Error('slot setup failed');
      expect(slot.value.slotAt?.toISOString()).toBe('2026-06-15T09:30:00.000Z');

      const r = await deleteField(fx.db, fx.actor, at.value.id);
      expect(r.ok).toBe(true);
      expect(await anchorOf(sigId)).toBe('day');

      const [after] = await fx.db.select().from(slots).where(eq(slots.id, slot.value.id)).limit(1);
      expect(after?.slotAt?.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    });

    it('keeps the template anchor a signup was created with', async () => {
      const r = await createSignup(
        fx.db,
        fx.actor,
        fx.workspaceId,
        { title: 'Template anchor', description: '', tags: [], visibility: 'unlisted', settings: {} },
        { template: DEFAULT_TEMPLATE },
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(await anchorOf(r.value.id)).toBe('date');
    });
  });

  describe('listFields', () => {
    it('returns fields ordered by sortOrder', async () => {
      const sigId = await createTestSignup(fx, 'List ordered');
      await addField(fx.db, fx.actor, sigId, {
        ref: 'b',
        label: 'B',
        fieldType: 'text',
        config: { fieldType: 'text' },
        sortOrder: 5,
      });
      await addField(fx.db, fx.actor, sigId, {
        ref: 'a',
        label: 'A',
        fieldType: 'text',
        config: { fieldType: 'text' },
        sortOrder: 1,
      });
      const r = await listFields(fx.db, fx.actor, sigId);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.map((f) => f.ref)).toEqual(['a', 'b']);
    });
  });

  describe('addSlot integrates with fields', () => {
    it('rejects values that don’t validate against fields', async () => {
      const sigId = await createTestSignup(fx, 'Slot validation');
      await addField(fx.db, fx.actor, sigId, {
        ref: 'date',
        label: 'Date',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      const r = await addSlot(fx.db, fx.actor, sigId, {
        values: { date: 'not-a-date' },
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');
    });

    it('derives slot_at from configured date+time fields', async () => {
      const sigId = await createTestSignup(fx, 'SlotAt deriv');
      await addField(fx.db, fx.actor, sigId, {
        ref: 'date',
        label: 'Date',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      await addField(fx.db, fx.actor, sigId, {
        ref: 'time',
        label: 'Time',
        fieldType: 'time',
        config: { fieldType: 'time' },
      });
      const r = await addSlot(fx.db, fx.actor, sigId, {
        values: { date: '2026-05-15', time: '09:30' },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.slotAt?.toISOString()).toBe('2026-05-15T09:30:00.000Z');
    });
  });
});
