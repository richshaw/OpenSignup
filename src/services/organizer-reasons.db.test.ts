import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { TITLE_MAX_LENGTH } from '@/lib/signup-limits';
import { commitToSlot } from '@/services/commitments';
import {
  closeSignup,
  createSignup,
  publishSignup,
  reopenSignup,
  updateSignup,
} from '@/services/signups';
import { listFieldsForSignup, reorderFields, updateField } from '@/services/slot-fields';
import { deleteSlot, listSlotsForSignup, reorderSlots, updateSlot } from '@/services/slots';

// Which refusals carry a `details.reason` for the organizer screens (see
// `ErrorReason`): each one a screen words in a way of its own. Every other
// field is as it always was, `message` and `suggestion` included, so API
// callers and AI assistants read the same English as before.

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
  const slug = `test-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;
  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Test Org' });
    await tx
      .insert(workspaces)
      .values({ id: workspaceId, slug, name: 'Test Workspace', type: 'personal', plan: 'free' });
    await tx.insert(workspaceMembers).values({
      id: makeId('mem'),
      workspaceId,
      organizerId,
      role: 'owner',
      status: 'active',
    });
  });
  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  return { db, workspaceId, organizerId, actor };
}

/** A draft from the default template: a "what" text field, a "date" date field and one slot. */
async function makeDraft(fx: Fixture, title: string) {
  const created = await createSignup(fx.db, fx.actor, fx.workspaceId, { title });
  if (!created.ok) throw new Error(`createSignup failed: ${created.error.message}`);
  const signupId = created.value.id;
  const [slot] = await listSlotsForSignup(fx.db, signupId);
  if (!slot) throw new Error('the default template made no slot');
  return { signupId, slotId: slot.id };
}

/** One sign-up of `quantity` spots on an open signup's slot. */
async function signUp(fx: Fixture, slotId: string, quantity: number) {
  const done = await commitToSlot(fx.db, slotId, {
    name: 'Pat',
    email: `pat-${makeId('par').slice(-6).toLowerCase()}@example.test`,
    quantity,
  });
  if (!done.ok) throw new Error(`commitToSlot failed: ${done.error.message}`);
}

describe('the reason a refusal on an organizer screen names (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it('names a title too short, creating or updating, and nothing else about a title', async () => {
    const tooShort = {
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'Title must be at least 2 characters.',
        field: 'title',
        suggestion: 'Check the value of "title".',
        details: { reason: 'title_too_short' },
      },
    };
    expect(await createSignup(fx.db, fx.actor, fx.workspaceId, { title: ' a ' })).toEqual(tooShort);
    const { signupId } = await makeDraft(fx, 'Reasons, title');
    expect(await updateSignup(fx.db, fx.actor, signupId, { title: '' })).toEqual(tooShort);

    const tooLong = await createSignup(fx.db, fx.actor, fx.workspaceId, {
      title: 'x'.repeat(TITLE_MAX_LENGTH + 1),
    });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error.details).toBeUndefined();
  });

  it('names a date before the earliest year, and not one that is no date at all', async () => {
    const { slotId } = await makeDraft(fx, 'Reasons, date');
    expect(await updateSlot(fx.db, fx.actor, slotId, { values: { date: '1899-12-31' } })).toEqual({
      ok: false,
      error: {
        code: 'invalid_input',
        message: '"date" must be a date in 1900 or later',
        field: 'date',
        received: '1899-12-31',
        details: { reason: 'date_too_early' },
      },
    });
    const notADay = await updateSlot(fx.db, fx.actor, slotId, { values: { date: '2030-02-30' } });
    expect(notADay.ok).toBe(false);
    if (!notADay.ok) expect(notADay.error.details).toBeUndefined();
  });

  it('names an order that leaves out a slot, and one that leaves out a field', async () => {
    const { signupId } = await makeDraft(fx, 'Reasons, order');
    expect(await reorderSlots(fx.db, fx.actor, signupId, { slotIds: ['slot_gone'] })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'invalid_input',
        message: 'slotIds must list every slot of the signup exactly once',
        field: 'slotIds',
        details: expect.objectContaining({ reason: 'slot_ids_mismatch' }),
      }),
    });
    const fields = await listFieldsForSignup(fx.db, signupId);
    expect(await reorderFields(fx.db, fx.actor, signupId, { fieldIds: [fields[0]!.id] })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'invalid_input',
        message: 'fieldIds must list every field of the signup exactly once',
        field: 'fieldIds',
        details: expect.objectContaining({ reason: 'field_ids_mismatch' }),
      }),
    });
  });

  it('names a slot people have signed up for, and fewer spots than they took', async () => {
    const { signupId, slotId } = await makeDraft(fx, 'Reasons, spots');
    if (!(await updateSlot(fx.db, fx.actor, slotId, { capacity: 3 })).ok)
      throw new Error('capacity');
    if (!(await publishSignup(fx.db, fx.actor, signupId)).ok) throw new Error('publish');
    await signUp(fx, slotId, 2);

    expect(await deleteSlot(fx.db, fx.actor, slotId, { force: false })).toEqual({
      ok: false,
      error: {
        code: 'conflict',
        message: '2 people have signed up for this slot',
        field: 'slotId',
        suggestion:
          'confirm with the organizer, then call again with force: true to remove the slot and their places',
        details: { reason: 'slot_has_signups', filled: 2, commitments: 1 },
      },
    });
    expect(await updateSlot(fx.db, fx.actor, slotId, { capacity: 1 })).toEqual({
      ok: false,
      error: {
        code: 'conflict',
        message: 'capacity (1) is less than active quantity (2)',
        field: 'capacity',
        received: 1,
        suggestion: 'cancel some commitments before lowering capacity',
        details: { reason: 'capacity_below_taken', taken: 2 },
      },
    });
  });

  it('names a field change that would break the values its slots hold', async () => {
    const { signupId, slotId } = await makeDraft(fx, 'Reasons, field');
    if (!(await updateSlot(fx.db, fx.actor, slotId, { values: { what: 'Juice' } })).ok) {
      throw new Error('updateSlot failed');
    }
    const what = (await listFieldsForSignup(fx.db, signupId)).find((f) => f.ref === 'what');
    expect(
      await updateField(fx.db, fx.actor, what!.id, {
        fieldType: 'number',
        config: { fieldType: 'number' },
      }),
    ).toEqual({
      ok: false,
      error: {
        code: 'conflict',
        message: 'change would invalidate existing slot values',
        details: { reason: 'invalidates_slot_values', slotIds: [slotId], count: 1 },
      },
    });
  });

  it('names a status that has changed, and a signup with no slots to open', async () => {
    const { signupId, slotId } = await makeDraft(fx, 'Reasons, status');
    if (!(await publishSignup(fx.db, fx.actor, signupId)).ok) throw new Error('publish');
    expect(await publishSignup(fx.db, fx.actor, signupId)).toEqual({
      ok: false,
      error: {
        code: 'conflict',
        message: 'cannot open a signup that is open',
        field: 'status',
        received: 'open',
        expected: 'draft',
        suggestion: 'call the correct transition for status=open',
        details: { reason: 'status_changed' },
      },
    });

    if (!(await closeSignup(fx.db, fx.actor, signupId)).ok) throw new Error('close');
    if (!(await deleteSlot(fx.db, fx.actor, slotId, { force: false })).ok)
      throw new Error('delete');
    expect(await reopenSignup(fx.db, fx.actor, signupId)).toEqual({
      ok: false,
      error: {
        code: 'conflict',
        message: 'reopen requires at least one slot',
        field: 'slots',
        suggestion: 'add a slot before reopening',
        details: { reason: 'no_slots' },
      },
    });

    const empty = await makeDraft(fx, 'Reasons, no slots');
    if (!(await deleteSlot(fx.db, fx.actor, empty.slotId, { force: false })).ok) {
      throw new Error('delete');
    }
    expect(await publishSignup(fx.db, fx.actor, empty.signupId)).toEqual({
      ok: false,
      error: {
        code: 'conflict',
        message: 'publish requires at least one slot',
        field: 'slots',
        suggestion: 'add a slot before publishing',
        details: { reason: 'no_slots' },
      },
    });
  });
});
