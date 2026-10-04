import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import {
  cancelOwnCommitment,
  commitToSlot,
  editLimitsForCommitment,
  getOwnCommitment,
  getOwnCommitmentsForSignup,
  updateOwnCommitment,
} from '@/services/commitments';
import {
  archiveSignup,
  closeSignup,
  createSignup,
  publishSignup,
  updateSignup,
} from '@/services/signups';
import { addSlot, deleteSlot, updateSlot } from '@/services/slots';
import { settle, untilServiceBlockedOn } from '@/services/testing/locks';
import { removeParticipantEmail } from '@/services/testing/participants';

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
  const slug = `test-${workspaceId.slice(-8).toLowerCase()}`;
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

  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };

  return { db, workspaceId, organizerId, actor };
}

async function teardownWorkspace(db: Db, workspaceId: string, organizerId: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(organizers).where(eq(organizers.id, organizerId));
}

async function makeOpenSignupWithSlot(fx: Fixture, title: string) {
  const created = await createSignup(fx.db, fx.actor, fx.workspaceId, {
    title,
    description: '',
    tags: [],
    visibility: 'unlisted' as const,
    settings: {},
  });
  if (!created.ok) throw new Error(`createSignup failed: ${created.error.message}`);

  const slot = await addSlot(fx.db, fx.actor, created.value.id, {
    values: {},
    capacity: 5,
  });
  if (!slot.ok) throw new Error(`addSlot failed: ${slot.error.message}`);

  const pub = await publishSignup(fx.db, fx.actor, created.value.id);
  if (!pub.ok) throw new Error(`publishSignup failed: ${pub.error.message}`);

  return { signupId: created.value.id, slotId: slot.value.id };
}

describe('commitToSlot (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('returns signupSlug matching the signup slug', async () => {
    const { signupId, slotId } = await makeOpenSignupWithSlot(fx, 'Slug test signup');
    const [signupRow] = await fx.db
      .select({ slug: signups.slug })
      .from(signups)
      .where(eq(signups.id, signupId))
      .limit(1);
    if (!signupRow) throw new Error('signup not found');

    const result = await commitToSlot(fx.db, slotId, {
      name: 'Slug Tester',
      email: 'slugtester@example.test',
      quantity: 1,
    });
    if (!result.ok) throw new Error(`commitToSlot failed: ${result.error.message}`);
    expect(result.value.signupSlug).toBe(signupRow.slug);
  });
});

describe('updateOwnCommitment swap (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('rejects a swap whose target slot is in a different signup', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup A');
    const b = await makeOpenSignupWithSlot(fx, 'Signup B');

    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Alice',
      email: 'alice@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const original = committed.value.commitment;
    const editToken = committed.value.editToken;

    const r = await updateOwnCommitment(fx.db, original.id, editToken, {
      swapToSlotId: b.slotId,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('forbidden');

    // Original commitment in signup A is still confirmed (transaction rolled back).
    const stillThere = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.id, original.id))
      .limit(1);
    expect(stillThere[0]?.status).toBe('confirmed');

    // No commitment row was created in signup B.
    const inB = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.signupId, b.signupId));
    expect(inB.length).toBe(0);
  });

  it('allows a swap to another slot within the same signup', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup C');
    const second = await addSlot(fx.db, fx.actor, a.signupId, {
      values: {},
      capacity: 5,
    });
    if (!second.ok) throw new Error(`second addSlot failed: ${second.error.message}`);

    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Bob',
      email: 'bob@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const original = committed.value.commitment;
    const editToken = committed.value.editToken;

    const r = await updateOwnCommitment(fx.db, original.id, editToken, {
      swapToSlotId: second.value.id,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slotId).toBe(second.value.id);
    expect(r.value.signupId).toBe(a.signupId);

    // Original is now cancelled; new commitment is on the second slot.
    const originalRow = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.id, original.id))
      .limit(1);
    expect(originalRow[0]?.status).toBe('cancelled');

    const onSecond = await fx.db
      .select()
      .from(commitments)
      .where(and(eq(commitments.slotId, second.value.id), eq(commitments.status, 'confirmed')));
    expect(onSecond.length).toBe(1);
  });

  // The move commits the participant it already has rather than looking them
  // up again by email, so it must not depend on the email being there.
  it('keeps the same participant when it moves them to another slot', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup G');
    const second = await addSlot(fx.db, fx.actor, a.signupId, { values: {}, capacity: 5 });
    if (!second.ok) throw new Error(`addSlot failed: ${second.error.message}`);

    const mine = await commitToSlot(fx.db, a.slotId, {
      name: 'Gil',
      email: 'gil@example.test',
      quantity: 1,
    });
    if (!mine.ok) throw new Error(`commitToSlot failed: ${mine.error.message}`);
    const { participantId } = mine.value.commitment;

    const r = await updateOwnCommitment(fx.db, mine.value.commitment.id, mine.value.editToken, {
      swapToSlotId: second.value.id,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.value.participantId).toBe(participantId);

    const people = await fx.db
      .select({ id: participants.id })
      .from(participants)
      .where(eq(participants.signupId, a.signupId));
    expect(people).toEqual([{ id: participantId }]);

    const events = await fx.db
      .select({ eventType: activity.eventType, actorId: activity.actorId })
      .from(activity)
      .where(eq(activity.signupId, a.signupId));
    expect(events.filter((e) => e.eventType === 'participant.created')).toHaveLength(1);
    expect(events.find((e) => e.eventType === 'commitment.swapped')?.actorId).toBe(participantId);
  });

  it('renames the participant when a move also changes the name', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup H');
    const second = await addSlot(fx.db, fx.actor, a.signupId, { values: {}, capacity: 5 });
    if (!second.ok) throw new Error(`addSlot failed: ${second.error.message}`);

    const mine = await commitToSlot(fx.db, a.slotId, {
      name: 'Hal',
      email: 'hal@example.test',
      quantity: 1,
    });
    if (!mine.ok) throw new Error(`commitToSlot failed: ${mine.error.message}`);
    const { participantId } = mine.value.commitment;
    const longAgo = new Date('2020-01-01T00:00:00Z');
    await fx.db
      .update(participants)
      .set({ lastSeenAt: longAgo })
      .where(eq(participants.id, participantId));

    const r = await updateOwnCommitment(fx.db, mine.value.commitment.id, mine.value.editToken, {
      swapToSlotId: second.value.id,
      name: 'Hal Example',
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const [p] = await fx.db
      .select({ name: participants.name, lastSeenAt: participants.lastSeenAt })
      .from(participants)
      .where(eq(participants.id, participantId));
    expect(p?.name).toBe('Hal Example');
    expect(p?.lastSeenAt.getTime()).toBeGreaterThan(longAgo.getTime());
  });

  it('refuses a move whose new name is blank, and changes nothing', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup K');
    const second = await addSlot(fx.db, fx.actor, a.signupId, { values: {}, capacity: 5 });
    if (!second.ok) throw new Error(`addSlot failed: ${second.error.message}`);

    const mine = await commitToSlot(fx.db, a.slotId, {
      name: 'Kit',
      email: 'kit@example.test',
      quantity: 1,
    });
    if (!mine.ok) throw new Error(`commitToSlot failed: ${mine.error.message}`);

    await expect(
      updateOwnCommitment(fx.db, mine.value.commitment.id, mine.value.editToken, {
        swapToSlotId: second.value.id,
        name: '   ',
      }),
    ).rejects.toMatchObject({ serviceError: { code: 'invalid_input' } });

    const [row] = await fx.db
      .select({ status: commitments.status, name: participants.name })
      .from(commitments)
      .innerJoin(participants, eq(participants.id, commitments.participantId))
      .where(eq(commitments.id, mine.value.commitment.id));
    expect(row).toEqual({ status: 'confirmed', name: 'Kit' });
  });

  it('refuses to move someone to a slot they already hold', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup I');
    const second = await addSlot(fx.db, fx.actor, a.signupId, { values: {}, capacity: 5 });
    if (!second.ok) throw new Error(`addSlot failed: ${second.error.message}`);

    const person = { name: 'Ivy', email: 'ivy@example.test', quantity: 1 };
    const first = await commitToSlot(fx.db, a.slotId, person);
    if (!first.ok) throw new Error(`commitToSlot failed: ${first.error.message}`);
    const held = await commitToSlot(fx.db, second.value.id, person);
    if (!held.ok) throw new Error(`commitToSlot failed: ${held.error.message}`);

    await expect(
      updateOwnCommitment(fx.db, first.value.commitment.id, first.value.editToken, {
        swapToSlotId: second.value.id,
      }),
    ).rejects.toMatchObject({
      serviceError: { code: 'conflict', details: { commitmentId: held.value.commitment.id } },
    });

    const [row] = await fx.db
      .select({ status: commitments.status })
      .from(commitments)
      .where(eq(commitments.id, first.value.commitment.id));
    expect(row?.status).toBe('confirmed');
  });

  it('refuses to move someone to a closed slot', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup J');
    const shut = await addSlot(fx.db, fx.actor, a.signupId, { values: {}, capacity: 5 });
    if (!shut.ok) throw new Error(`addSlot failed: ${shut.error.message}`);
    const closed = await updateSlot(fx.db, fx.actor, shut.value.id, { status: 'closed' });
    if (!closed.ok) throw new Error(`updateSlot failed: ${closed.error.message}`);

    const mine = await commitToSlot(fx.db, a.slotId, {
      name: 'Jo',
      email: 'jo@example.test',
      quantity: 1,
    });
    if (!mine.ok) throw new Error(`commitToSlot failed: ${mine.error.message}`);

    await expect(
      updateOwnCommitment(fx.db, mine.value.commitment.id, mine.value.editToken, {
        swapToSlotId: shut.value.id,
      }),
    ).rejects.toMatchObject({ serviceError: { code: 'closed' } });

    const [row] = await fx.db
      .select({ status: commitments.status })
      .from(commitments)
      .where(eq(commitments.id, mine.value.commitment.id));
    expect(row?.status).toBe('confirmed');
  });

  it('surfaces the structured error (not a generic 500) when the target slot is full', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup D');
    const full = await addSlot(fx.db, fx.actor, a.signupId, { values: {}, capacity: 1 });
    if (!full.ok) throw new Error(`addSlot failed: ${full.error.message}`);

    // Fill the target slot with someone else's commitment.
    const filler = await commitToSlot(fx.db, full.value.id, {
      name: 'Filler',
      email: 'filler@example.test',
      quantity: 1,
    });
    if (!filler.ok) throw new Error(`commitToSlot failed: ${filler.error.message}`);

    const mine = await commitToSlot(fx.db, a.slotId, {
      name: 'Dana',
      email: 'dana@example.test',
      quantity: 1,
    });
    if (!mine.ok) throw new Error(`commitToSlot failed: ${mine.error.message}`);

    // A failed inner commit inside the swap transaction must short-circuit via
    // ServiceException so the route handler returns capacity_full, not internal.
    await expect(
      updateOwnCommitment(fx.db, mine.value.commitment.id, mine.value.editToken, {
        swapToSlotId: full.value.id,
      }),
    ).rejects.toMatchObject({ serviceError: { code: 'capacity_full' } });

    // Rolled back: the original commitment is still active on its slot.
    const originalRow = await fx.db
      .select({ status: commitments.status, slotId: commitments.slotId })
      .from(commitments)
      .where(eq(commitments.id, mine.value.commitment.id))
      .limit(1);
    expect(originalRow[0]?.status).toBe('confirmed');
    expect(originalRow[0]?.slotId).toBe(a.slotId);
  });

  it('refuses to edit a cancelled commitment', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup E');
    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Eli',
      email: 'eli@example.test',
      notes: 'original',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const { commitment, editToken } = committed.value;

    const cancelled = await cancelOwnCommitment(fx.db, commitment.id, editToken);
    expect(cancelled.ok).toBe(true);

    // The edit token still verifies, so only the status guard stops this.
    const r = await updateOwnCommitment(fx.db, commitment.id, editToken, { notes: 'changed' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected a conflict');
    expect(r.error.code).toBe('conflict');

    const row = await fx.db
      .select({ notes: commitments.notes })
      .from(commitments)
      .where(eq(commitments.id, commitment.id))
      .limit(1);
    expect(row[0]?.notes).toBe('original');
  });

  it('reports conflict, not capacity_full, when a cancelled commitment asks for more', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Signup F');
    const slot = await addSlot(fx.db, fx.actor, a.signupId, { values: {}, capacity: 2 });
    if (!slot.ok) throw new Error(`addSlot failed: ${slot.error.message}`);

    const mine = await commitToSlot(fx.db, slot.value.id, {
      name: 'Fay',
      email: 'fay@example.test',
      quantity: 1,
    });
    if (!mine.ok) throw new Error(`commitToSlot failed: ${mine.error.message}`);

    const cancelled = await cancelOwnCommitment(
      fx.db,
      mine.value.commitment.id,
      mine.value.editToken,
    );
    expect(cancelled.ok).toBe(true);

    // Someone else takes the whole slot, so a quantity increase would trip the
    // capacity guard if it ran before the status check.
    const filler = await commitToSlot(fx.db, slot.value.id, {
      name: 'Filler',
      email: 'filler-f@example.test',
      quantity: 2,
    });
    if (!filler.ok) throw new Error(`commitToSlot failed: ${filler.error.message}`);

    const r = await updateOwnCommitment(fx.db, mine.value.commitment.id, mine.value.editToken, {
      quantity: 2,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected a conflict');
    expect(r.error.code).toBe('conflict');

    // A terminal commitment must not leave an attempt_failed row behind.
    const events = await fx.db
      .select()
      .from(activity)
      .where(
        and(eq(activity.signupId, a.signupId), eq(activity.eventType, 'commitment.attempt_failed')),
      );
    expect(events.length).toBe(0);
  });
});

describe('updateOwnCommitment quantity edit under concurrency (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('does not deadlock with the slot being deleted while it raises the quantity', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Edit during slot delete');
    const mine = await commitToSlot(fx.db, a.slotId, {
      name: 'Gus',
      email: 'gus@example.test',
      quantity: 1,
    });
    if (!mine.ok) throw new Error(`commitToSlot failed: ${mine.error.message}`);

    let editing: ReturnType<typeof updateOwnCommitment> | undefined;
    // What deleteSlot does, held open between its two steps: it locks the slot,
    // and only then deletes it, which cascades to the commitment. An edit that
    // locked the commitment first and then queued for the slot would close the
    // cycle, and Postgres would fail one of the two.
    const held = fx.db.transaction(async (tx) => {
      await tx.select().from(slots).where(eq(slots.id, a.slotId)).for('update');
      editing = updateOwnCommitment(fx.db, mine.value.commitment.id, mine.value.editToken, {
        quantity: 3,
      });
      await untilServiceBlockedOn(fx.db, tx, editing);
      const deleted = await deleteSlot(tx as unknown as Db, fx.actor, a.slotId);
      expect(deleted.ok, JSON.stringify(deleted)).toBe(true);
    });
    await held.finally(() => settle(editing));

    const r = await editing!;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_found');
  });

  it('checks capacity against the quantity as it is now, not as the pre-flight read saw it', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Edit after a stale read');
    const slot = await addSlot(fx.db, fx.actor, a.signupId, { values: {}, capacity: 4 });
    if (!slot.ok) throw new Error(`addSlot failed: ${slot.error.message}`);
    const mine = await commitToSlot(fx.db, slot.value.id, {
      name: 'Hana',
      email: 'hana@example.test',
      quantity: 3,
    });
    if (!mine.ok) throw new Error(`commitToSlot failed: ${mine.error.message}`);
    const other = await commitToSlot(fx.db, slot.value.id, {
      name: 'Ivo',
      email: 'ivo@example.test',
      quantity: 1,
    });
    if (!other.ok) throw new Error(`commitToSlot failed: ${other.error.message}`);

    let editing: ReturnType<typeof updateOwnCommitment> | undefined;
    // Hana drops to 1 in another tab and Ivo takes the two places that frees,
    // landing after this edit's pre-flight read saw 3. Asking for 2 is then an
    // increase on a full slot, though it looked like a decrease from 3.
    const held = fx.db.transaction(async (tx) => {
      await tx
        .update(commitments)
        .set({ quantity: 1 })
        .where(eq(commitments.id, mine.value.commitment.id));
      await tx
        .update(commitments)
        .set({ quantity: 3 })
        .where(eq(commitments.id, other.value.commitment.id));
      editing = updateOwnCommitment(fx.db, mine.value.commitment.id, mine.value.editToken, {
        quantity: 2,
      });
      await untilServiceBlockedOn(fx.db, tx, editing);
    });
    await held.finally(() => settle(editing));

    const r = await editing!;
    expect(r.ok, JSON.stringify(r)).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('capacity_full');

    const [booked] = await fx.db
      .select({ places: sql<number>`coalesce(sum(${commitments.quantity}), 0)::int` })
      .from(commitments)
      .where(and(eq(commitments.slotId, slot.value.id), eq(commitments.status, 'confirmed')));
    expect(booked?.places).toBe(4);
  });
});

// A slot takes no more places once the organizer closes or archives its
// signup or closes the slot, or the signup's closesAt or the lockout before the
// slot comes. Signing up already checked all of that; raising a quantity
// through an edit link did not. Lowering it, fixing a name or notes, and
// cancelling only give places back or correct details, so they still work.
describe('updateOwnCommitment on a slot that takes no more places (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  async function succeeds(r: Promise<{ ok: boolean }>) {
    const done = await r;
    expect(done.ok, JSON.stringify(done)).toBe(true);
  }

  type Shut = (fx: Fixture, s: { signupId: string; slotId: string }) => Promise<void>;
  const SHUT: Array<[string, Shut, { reason: string; detail: string }]> = [
    [
      'closed',
      (fx, s) => succeeds(closeSignup(fx.db, fx.actor, s.signupId)),
      { reason: 'closed', detail: 'signup_closed' },
    ],
    [
      'archived',
      (fx, s) => succeeds(archiveSignup(fx.db, fx.actor, s.signupId)),
      { reason: 'closed', detail: 'signup_archived' },
    ],
    [
      'past its closesAt',
      (fx, s) =>
        succeeds(
          updateSignup(fx.db, fx.actor, s.signupId, {
            closesAt: new Date(Date.now() - 60_000).toISOString(),
          }),
        ),
      { reason: 'over_window', detail: 'closes_at_elapsed' },
    ],
    [
      'whose slot is closed',
      (fx, s) => succeeds(updateSlot(fx.db, fx.actor, s.slotId, { status: 'closed' })),
      { reason: 'closed', detail: 'slot_closed' },
    ],
    // Tomorrow's date anchors at noon UTC, well inside a 72-hour lockout.
    [
      'inside the lockout before its slot',
      async (fx, s) => {
        const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
        await succeeds(updateSlot(fx.db, fx.actor, s.slotId, { values: { date: tomorrow } }));
        await succeeds(
          updateSignup(fx.db, fx.actor, s.signupId, { settings: { lockoutHoursBeforeSlot: 72 } }),
        );
      },
      { reason: 'over_window', detail: 'slot_lockout' },
    ],
  ];

  /** An open signup (one slot, capacity 5) where Pat holds 2 places. */
  async function holdingTwo(title: string) {
    const a = await makeOpenSignupWithSlot(fx, title);
    const mine = await commitToSlot(fx.db, a.slotId, {
      name: 'Pat Example',
      email: 'pat@example.com',
      notes: 'original',
      quantity: 2,
    });
    if (!mine.ok) throw new Error(`commitToSlot failed: ${mine.error.message}`);
    return { ...a, commitment: mine.value.commitment, editToken: mine.value.editToken };
  }

  async function activityOf(
    signupId: string,
    eventType: 'commitment.attempt_failed' | 'commitment.updated',
  ) {
    return fx.db
      .select()
      .from(activity)
      .where(and(eq(activity.signupId, signupId), eq(activity.eventType, eventType)));
  }

  it.each(SHUT)('refuses an increase on a signup %s', async (name, shutDown, logged) => {
    const s = await holdingTwo(`Increase, ${name}`);
    await shutDown(fx, s);

    const r = await updateOwnCommitment(fx.db, s.commitment.id, s.editToken, {
      quantity: 3,
      notes: 'changed',
    });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('closed');

    // Nothing in the request was written, the notes included.
    const [row] = await fx.db
      .select({ quantity: commitments.quantity, notes: commitments.notes })
      .from(commitments)
      .where(eq(commitments.id, s.commitment.id));
    expect(row).toEqual({ quantity: 2, notes: 'original' });
    expect(await activityOf(s.signupId, 'commitment.updated')).toHaveLength(0);

    // The refusal is logged the way a refused sign-up is.
    const failed = await activityOf(s.signupId, 'commitment.attempt_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]?.actorType).toBe('participant');
    expect(failed[0]?.payload).toEqual({
      slotId: s.slotId,
      ...logged,
      source: 'update',
      requested: 3,
    });
  });

  // The rules moved out of commitToSlot into the helper both share; signing up
  // must still be refused, and logged, exactly as before.
  it.each(SHUT)('refuses a sign-up on a signup %s, as before', async (name, shutDown, logged) => {
    const s = await holdingTwo(`Sign-up, ${name}`);
    await shutDown(fx, s);

    const r = await commitToSlot(fx.db, s.slotId, {
      name: 'Sam Example',
      email: 'sam@example.com',
      quantity: 1,
    });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('closed');

    const failed = await activityOf(s.signupId, 'commitment.attempt_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]?.actorType).toBe('system');
    expect(failed[0]?.payload).toEqual({ slotId: s.slotId, ...logged });
  });

  it.each(SHUT)('lets a decrease through on a signup %s', async (name, shutDown) => {
    const s = await holdingTwo(`Decrease, ${name}`);
    await shutDown(fx, s);

    const r = await updateOwnCommitment(fx.db, s.commitment.id, s.editToken, { quantity: 1 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) expect(r.value.quantity).toBe(1);
    expect(await activityOf(s.signupId, 'commitment.attempt_failed')).toHaveLength(0);
  });

  // The edit page sends the quantity it shows with every save, so a name or
  // notes change arrives with the quantity unchanged.
  it.each(SHUT)('lets a name and notes change through on a signup %s', async (name, shutDown) => {
    const s = await holdingTwo(`Details, ${name}`);
    await shutDown(fx, s);

    const r = await updateOwnCommitment(fx.db, s.commitment.id, s.editToken, {
      name: 'Pat Q. Example',
      notes: 'changed',
      quantity: 2,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok)
      expect({ quantity: r.value.quantity, notes: r.value.notes }).toEqual({
        quantity: 2,
        notes: 'changed',
      });
    const [p] = await fx.db
      .select({ name: participants.name })
      .from(participants)
      .where(eq(participants.id, s.commitment.participantId));
    expect(p?.name).toBe('Pat Q. Example');
  });

  it.each(SHUT)('lets a cancel through on a signup %s', async (name, shutDown) => {
    const s = await holdingTwo(`Cancel, ${name}`);
    await shutDown(fx, s);

    const r = await cancelOwnCommitment(fx.db, s.commitment.id, s.editToken);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const [row] = await fx.db
      .select({ status: commitments.status })
      .from(commitments)
      .where(eq(commitments.id, s.commitment.id));
    expect(row?.status).toBe('cancelled');
  });

  // The edit page caps its field with this; offering more than the save
  // accepts would only lead to the error.
  it.each(SHUT)('caps the edit page at what is held on a signup %s', async (name, shutDown) => {
    const s = await holdingTwo(`Max, ${name}`);
    expect(await editLimitsForCommitment(fx.db, s.commitment)).toEqual({
      maxQuantity: 5,
      closed: false,
    });
    await shutDown(fx, s);
    expect(await editLimitsForCommitment(fx.db, s.commitment)).toEqual({
      maxQuantity: 2,
      closed: true,
    });
  });

  // The signup is read after the commitment lock, so a close that commits
  // while the edit waits on it is seen, not the open signup the edit link's
  // pre-flight read found.
  it('refuses an increase when the signup closes while it waits on the commitment', async () => {
    const s = await holdingTwo('Closed while queued');

    let editing: ReturnType<typeof updateOwnCommitment> | undefined;
    const held = fx.db.transaction(async (tx) => {
      await tx.select().from(commitments).where(eq(commitments.id, s.commitment.id)).for('update');
      editing = updateOwnCommitment(fx.db, s.commitment.id, s.editToken, { quantity: 3 });
      await untilServiceBlockedOn(fx.db, tx, editing);
      await succeeds(closeSignup(fx.db, fx.actor, s.signupId));
    });
    await held.finally(() => settle(editing));

    const r = await editing!;
    expect(r.ok, JSON.stringify(r)).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('closed');
    const [row] = await fx.db
      .select({ quantity: commitments.quantity })
      .from(commitments)
      .where(eq(commitments.id, s.commitment.id));
    expect(row?.quantity).toBe(2);
  });
});

describe('cancelOwnCommitment (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('cancels a confirmed commitment and writes exactly one activity row', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Cancel Confirmed');
    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Carla',
      email: 'carla@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const { commitment, editToken } = committed.value;

    const r = await cancelOwnCommitment(fx.db, commitment.id, editToken);
    expect(r.ok).toBe(true);

    const row = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.id, commitment.id))
      .limit(1);
    expect(row[0]?.status).toBe('cancelled');
    expect(row[0]?.cancelledAt).not.toBeNull();

    const events = await fx.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.signupId, a.signupId),
          eq(activity.eventType, 'commitment.cancelled'),
        ),
      );
    expect(events.length).toBe(1);
  });

  it('allows a waitlisted participant to cancel themselves', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Cancel Waitlist');
    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Wendy',
      email: 'wendy@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const { commitment, editToken } = committed.value;

    // Force the row into the 'waitlist' status — simulates capacity-overflow path.
    await fx.db
      .update(commitments)
      .set({ status: 'waitlist' })
      .where(eq(commitments.id, commitment.id));

    const r = await cancelOwnCommitment(fx.db, commitment.id, editToken);
    expect(r.ok).toBe(true);

    const row = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.id, commitment.id))
      .limit(1);
    expect(row[0]?.status).toBe('cancelled');
  });

  it('is idempotent: a second cancel returns ok and does not double-log activity', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Cancel Idempotent');
    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Ivan',
      email: 'ivan@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const { commitment, editToken } = committed.value;

    const first = await cancelOwnCommitment(fx.db, commitment.id, editToken);
    expect(first.ok).toBe(true);

    const second = await cancelOwnCommitment(fx.db, commitment.id, editToken);
    expect(second.ok).toBe(true);

    const events = await fx.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.signupId, a.signupId),
          eq(activity.eventType, 'commitment.cancelled'),
        ),
      );
    expect(events.length).toBe(1);
  });

  it('rejects cancelling an organizer-applied terminal status (no_show)', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Cancel NoShow');
    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Nora',
      email: 'nora@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const { commitment, editToken } = committed.value;

    await fx.db
      .update(commitments)
      .set({ status: 'no_show' })
      .where(eq(commitments.id, commitment.id));

    const r = await cancelOwnCommitment(fx.db, commitment.id, editToken);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('conflict');

    const row = await fx.db
      .select()
      .from(commitments)
      .where(eq(commitments.id, commitment.id))
      .limit(1);
    expect(row[0]?.status).toBe('no_show');
  });

  it('handles two concurrent cancels: one writes activity, both return ok', async () => {
    const a = await makeOpenSignupWithSlot(fx, 'Cancel Race');
    const committed = await commitToSlot(fx.db, a.slotId, {
      name: 'Rita',
      email: 'rita@example.test',
      quantity: 1,
    });
    if (!committed.ok) throw new Error(`commitToSlot failed: ${committed.error.message}`);
    const { commitment, editToken } = committed.value;

    const [r1, r2] = await Promise.all([
      cancelOwnCommitment(fx.db, commitment.id, editToken),
      cancelOwnCommitment(fx.db, commitment.id, editToken),
    ]);
    // Both should be ok — the loser sees status='cancelled' on its pre-flight read
    // and takes the idempotent success path.
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const events = await fx.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.signupId, a.signupId),
          eq(activity.eventType, 'commitment.cancelled'),
        ),
      );
    expect(events.length).toBe(1);
  });
});

describe('commitToSlot participant dedup (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('reuses the same participant row for emails that differ only by case', async () => {
    const { signupId, slotId } = await makeOpenSignupWithSlot(fx, 'Case dedup signup');
    const slot2 = await addSlot(fx.db, fx.actor, signupId, { values: {}, capacity: 5 });
    if (!slot2.ok) throw new Error(`addSlot failed: ${slot2.error.message}`);

    const r1 = await commitToSlot(fx.db, slotId, {
      name: 'Alice',
      email: 'Alice@Example.test',
      quantity: 1,
    });
    if (!r1.ok) throw new Error(`first commit failed: ${r1.error.message}`);

    const r2 = await commitToSlot(fx.db, slot2.value.id, {
      name: 'Alice',
      email: 'alice@example.test',
      quantity: 1,
    });
    if (!r2.ok) throw new Error(`second commit failed: ${r2.error.message}`);

    expect(r2.value.commitment.participantId).toBe(r1.value.commitment.participantId);

    const [row] = await fx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(participants)
      .where(eq(participants.signupId, signupId));
    expect(row?.n).toBe(1);

    const stored = await fx.db
      .select({ email: participants.email, emailLower: participants.emailLower })
      .from(participants)
      .where(eq(participants.id, r1.value.commitment.participantId));
    expect(stored[0]?.email).toBe('Alice@Example.test');
    expect(stored[0]?.emailLower).toBe('alice@example.test');
  });
});

describe('participants without an email (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('reads back through the edit link with a null email', async () => {
    const { signupId, slotId } = await makeOpenSignupWithSlot(fx, 'No email edit link');
    const r = await commitToSlot(fx.db, slotId, {
      name: 'Sam',
      email: 'sam@example.test',
      quantity: 1,
    });
    if (!r.ok) throw new Error(`commit failed: ${r.error.message}`);
    await removeParticipantEmail(fx.db, r.value.commitment.participantId);

    const own = await getOwnCommitment(fx.db, r.value.commitment.id, r.value.editToken);
    if (!own.ok) throw new Error(`getOwnCommitment failed: ${own.error.message}`);
    expect(own.value.participantName).toBe('Sam');
    expect(own.value.participantEmail).toBeNull();

    const returning = await getOwnCommitmentsForSignup(fx.db, signupId, [
      { commitmentId: r.value.commitment.id, token: r.value.editToken },
    ]);
    expect(returning.map((c) => c.participantEmail)).toEqual([null]);
  });

  it('can move to another slot', async () => {
    const { signupId, slotId } = await makeOpenSignupWithSlot(fx, 'No email move');
    const second = await addSlot(fx.db, fx.actor, signupId, { values: {}, capacity: 5 });
    if (!second.ok) throw new Error(`addSlot failed: ${second.error.message}`);
    const r = await commitToSlot(fx.db, slotId, {
      name: 'Sam',
      email: 'sam@example.test',
      quantity: 1,
    });
    if (!r.ok) throw new Error(`commit failed: ${r.error.message}`);
    const { participantId } = r.value.commitment;
    await removeParticipantEmail(fx.db, participantId);

    const moved = await updateOwnCommitment(fx.db, r.value.commitment.id, r.value.editToken, {
      swapToSlotId: second.value.id,
    });
    expect(moved.ok, JSON.stringify(moved)).toBe(true);
    if (!moved.ok) return;
    expect(moved.value.participantId).toBe(participantId);
  });

  it('can be more than one on the same signup', async () => {
    // The unique index on (signup_id, email_lower) treats NULLs as distinct.
    const { signupId } = await makeOpenSignupWithSlot(fx, 'Two without email');
    for (const name of ['Sam', 'Robin']) {
      await fx.db.insert(participants).values({
        id: makeId('par'),
        signupId,
        workspaceId: fx.workspaceId,
        email: null,
        emailLower: null,
        name,
      });
    }
    const [row] = await fx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(participants)
      .where(eq(participants.signupId, signupId));
    expect(row?.n).toBe(2);
  });

  it.each([
    { email: 'sam@example.test', emailLower: null },
    { email: null, emailLower: 'sam@example.test' },
  ])('refuses email $email with email_lower $emailLower', async ({ email, emailLower }) => {
    const { signupId } = await makeOpenSignupWithSlot(fx, 'Half an email');
    await expect(
      fx.db.insert(participants).values({
        id: makeId('par'),
        signupId,
        workspaceId: fx.workspaceId,
        email,
        emailLower,
        name: 'Sam',
      }),
    ).rejects.toMatchObject({
      cause: { code: '23514', constraint_name: 'participants_email_lower_with_email' },
    });
  });
});

describe('editLimitsForCommitment (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('is the capacity less what everyone else holds, not counting cancelled places', async () => {
    const { slotId } = await makeOpenSignupWithSlot(fx, 'Max quantity signup');
    const mine = await commitToSlot(fx.db, slotId, {
      name: 'Pat',
      email: 'pat@example.test',
      quantity: 2,
    });
    if (!mine.ok) throw new Error(`commit failed: ${mine.error.message}`);
    const theirs = await commitToSlot(fx.db, slotId, {
      name: 'Sam',
      email: 'sam@example.test',
      quantity: 1,
    });
    if (!theirs.ok) throw new Error(`commit failed: ${theirs.error.message}`);

    // Capacity 5: Sam's 1 is the only place that isn't Pat's own.
    expect(await editLimitsForCommitment(fx.db, mine.value.commitment)).toEqual({
      maxQuantity: 4,
      closed: false,
    });

    const cancelled = await cancelOwnCommitment(
      fx.db,
      theirs.value.commitment.id,
      theirs.value.editToken,
    );
    if (!cancelled.ok) throw new Error(`cancel failed: ${cancelled.error.message}`);
    expect(await editLimitsForCommitment(fx.db, mine.value.commitment)).toEqual({
      maxQuantity: 5,
      closed: false,
    });
  });

  // The edit page caps its field with this read and the edit guard enforces
  // its own sum; if the two ever disagree, the field offers a value the save
  // refuses, or hides one it would accept.
  it('agrees with the edit guard: the max is accepted and one more is refused', async () => {
    const { slotId } = await makeOpenSignupWithSlot(fx, 'Max quantity guard');
    const mine = await commitToSlot(fx.db, slotId, {
      name: 'Pat',
      email: 'pat@example.test',
      quantity: 1,
    });
    if (!mine.ok) throw new Error(`commit failed: ${mine.error.message}`);
    const theirs = await commitToSlot(fx.db, slotId, {
      name: 'Sam',
      email: 'sam@example.test',
      quantity: 2,
    });
    if (!theirs.ok) throw new Error(`commit failed: ${theirs.error.message}`);

    const { maxQuantity: max } = await editLimitsForCommitment(fx.db, mine.value.commitment);
    expect(max).toBe(3);

    const over = await updateOwnCommitment(fx.db, mine.value.commitment.id, mine.value.editToken, {
      quantity: max! + 1,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.code).toBe('capacity_full');

    const atMax = await updateOwnCommitment(fx.db, mine.value.commitment.id, mine.value.editToken, {
      quantity: max!,
    });
    expect(atMax.ok).toBe(true);
  });

  it('is 1 for the holder of a one-place slot, and null on an unlimited slot', async () => {
    const { signupId } = await makeOpenSignupWithSlot(fx, 'Max quantity edges');
    const single = await addSlot(fx.db, fx.actor, signupId, { values: {}, capacity: 1 });
    if (!single.ok) throw new Error(`addSlot failed: ${single.error.message}`);
    const unlimited = await addSlot(fx.db, fx.actor, signupId, { values: {}, capacity: null });
    if (!unlimited.ok) throw new Error(`addSlot failed: ${unlimited.error.message}`);

    const onSingle = await commitToSlot(fx.db, single.value.id, {
      name: 'Pat',
      email: 'pat@example.test',
      quantity: 1,
    });
    if (!onSingle.ok) throw new Error(`commit failed: ${onSingle.error.message}`);
    const onUnlimited = await commitToSlot(fx.db, unlimited.value.id, {
      name: 'Pat',
      email: 'pat@example.test',
      quantity: 3,
    });
    if (!onUnlimited.ok) throw new Error(`commit failed: ${onUnlimited.error.message}`);

    expect(await editLimitsForCommitment(fx.db, onSingle.value.commitment)).toEqual({
      maxQuantity: 1,
      closed: false,
    });
    expect(await editLimitsForCommitment(fx.db, onUnlimited.value.commitment)).toEqual({
      maxQuantity: null,
      closed: false,
    });
  });
});
