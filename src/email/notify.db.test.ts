import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { commitments } from '@/db/schema/commitments';
import { slots } from '@/db/schema/slots';
import { willSendReminder } from '@/lib/reminder-eligibility';
import { selectDueReminders } from '@/jobs/reminders';
import { notifyCommitmentCreated } from './notify';

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
  const slug = `conf-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Confirm Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Confirm Workspace',
      type: 'personal',
      plan: 'free',
    });
    await tx.insert(workspaceMembers).values({
      id: makeId('mem'),
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

async function commitOnce(fx: Fixture, title: string) {
  const created = await createSignup(fx.db, fx.actor, fx.workspaceId, {
    title,
    description: '',
    tags: [],
    visibility: 'unlisted' as const,
    settings: {},
  });
  if (!created.ok) throw new Error(created.error.message);
  const slot = await addSlot(fx.db, fx.actor, created.value.id, { values: {}, capacity: 4 });
  if (!slot.ok) throw new Error(slot.error.message);
  const pub = await publishSignup(fx.db, fx.actor, created.value.id);
  if (!pub.ok) throw new Error(pub.error.message);
  const commit = await commitToSlot(fx.db, slot.value.id, {
    name: 'Dana Participant',
    email: `${slot.value.id.slice(-10).toLowerCase()}@example.test`,
    quantity: 1,
  });
  if (!commit.ok) throw new Error(commit.error.message);
  return { commitmentId: commit.value.commitment.id, editToken: commit.value.editToken };
}

async function confirmationRows(db: Db, commitmentId: string): Promise<number> {
  const rows = await db
    .select({ id: activity.id })
    .from(activity)
    .where(
      and(
        eq(activity.eventType, 'commitment.confirmation_sent'),
        sql`(${activity.payload}->>'commitmentId') = ${commitmentId}`,
      ),
    );
  return rows.length;
}

describe('notifyCommitmentCreated (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it('records a confirmation_sent activity row', async () => {
    const { commitmentId, editToken } = await commitOnce(fx, 'Confirm me');
    await notifyCommitmentCreated(fx.db, commitmentId, editToken);
    expect(await confirmationRows(fx.db, commitmentId)).toBe(1);
  });

  it('does not send twice for the same commitment', async () => {
    const { commitmentId, editToken } = await commitOnce(fx, 'Confirm once');
    await notifyCommitmentCreated(fx.db, commitmentId, editToken);
    await notifyCommitmentCreated(fx.db, commitmentId, editToken);
    expect(await confirmationRows(fx.db, commitmentId)).toBe(1);
  });

  it('swallows an unknown commitment instead of throwing', async () => {
    await expect(
      notifyCommitmentCreated(fx.db, makeId('com'), 'irrelevant'),
    ).resolves.toBeUndefined();
  });

  describe('the reminder it promises', () => {
    /**
     * Places a commitment at a known offset from its own creation, then winds
     * both timestamps back so `now` sits where the first eligible scan would
     * be. That is the only way to ask the real question: not "is it due at
     * commit time" — it never is — but "will any later scan ever select it".
     */
    async function agreesWithDispatcher(
      title: string,
      slotMinutesAfterSignup: number,
      hoursSinceSignup: number,
    ): Promise<{ promised: boolean; dispatched: boolean }> {
      const { commitmentId } = await commitOnce(fx, title);
      const [row] = await fx.db
        .select({ slotId: commitments.slotId })
        .from(commitments)
        .where(eq(commitments.id, commitmentId));
      if (!row) throw new Error('commitment vanished');

      const createdAt = new Date(Date.now() - hoursSinceSignup * 3_600_000);
      const slotAt = new Date(createdAt.getTime() + slotMinutesAfterSignup * 60_000);
      await fx.db.update(commitments).set({ createdAt }).where(eq(commitments.id, commitmentId));
      await fx.db.update(slots).set({ slotAt }).where(eq(slots.id, row.slotId));

      const due = await selectDueReminders(fx.db);
      return {
        promised: willSendReminder({ sendReminders: true, slotAt, createdAt }),
        dispatched: due.some((d) => d.commitmentId === commitmentId),
      };
    }

    it('does not promise one for a slot too soon after signing up', async () => {
      // Sign up at 09:00 for a 09:40 slot. By the time the created_at guard
      // lets the scan reach it, the slot has already happened — so the receipt
      // must not say a reminder is coming.
      const { promised, dispatched } = await agreesWithDispatcher('Slot 40m out', 40, 1.5);
      expect(promised).toBe(false);
      expect(dispatched).toBe(false);
    });

    it('does not promise one for a slot already in the past', async () => {
      const { promised, dispatched } = await agreesWithDispatcher('Slot already gone', -120, 3);
      expect(promised).toBe(false);
      expect(dispatched).toBe(false);
    });

    it('promises one when the dispatcher will in fact send it', async () => {
      const { promised, dispatched } = await agreesWithDispatcher('Slot 20h out', 20 * 60, 2);
      expect(promised).toBe(true);
      expect(dispatched).toBe(true);
    });
  });
});
