import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { editTokenFor } from '@/lib/token';
import { selectDueReminders } from '@/jobs/reminders';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import {
  optOutOfReminders,
  previewReminderOptOut,
  reminderOptOutTokenFor,
} from './reminder-optout';

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
  const slug = `opt-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Optout Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Optout Workspace',
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

/** An open signup with one participant committed to a slot 20h out. */
async function makeDueCommitment(fx: Fixture, title: string) {
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

  await fx.db
    .update(slots)
    .set({ slotAt: sql`now() + interval '20 hours'` })
    .where(eq(slots.id, slot.value.id));
  await fx.db
    .update(commitments)
    .set({ createdAt: sql`now() - interval '7 days'` })
    .where(eq(commitments.id, commit.value.commitment.id));

  const [row] = await fx.db
    .select({ participantId: commitments.participantId })
    .from(commitments)
    .where(eq(commitments.id, commit.value.commitment.id))
    .limit(1);
  if (!row) throw new Error('commitment not found');

  return { commitmentId: commit.value.commitment.id, participantId: row.participantId };
}

async function signupIdFor(fx: Fixture, participantId: string): Promise<string | undefined> {
  const [row] = await fx.db
    .select({ signupId: participants.signupId })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  return row?.signupId;
}

describe('reminder opt-out (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it('opting out stops the participant being selected for reminders', async () => {
    const { commitmentId, participantId } = await makeDueCommitment(fx, 'Opt out me');
    const before = await selectDueReminders(fx.db);
    expect(before.map((r) => r.commitmentId)).toContain(commitmentId);

    const result = await optOutOfReminders(
      fx.db,
      participantId,
      reminderOptOutTokenFor(participantId),
    );
    expect(result.ok).toBe(true);

    const after = await selectDueReminders(fx.db);
    expect(after.map((r) => r.commitmentId)).not.toContain(commitmentId);
  });

  it('rejects a wrong token without changing anything', async () => {
    const { commitmentId, participantId } = await makeDueCommitment(fx, 'Bad token');
    const result = await optOutOfReminders(fx.db, participantId, 'not-the-token');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('forbidden');

    const due = await selectDueReminders(fx.db);
    expect(due.map((r) => r.commitmentId)).toContain(commitmentId);
  });

  it('rejects an edit token replayed as an unsubscribe token', async () => {
    // Both are HMACs over an id; the scope string is what keeps them distinct.
    const { participantId } = await makeDueCommitment(fx, 'Scope confusion');
    const result = await optOutOfReminders(fx.db, participantId, editTokenFor(participantId));
    expect(result.ok).toBe(false);
  });

  it('is idempotent', async () => {
    const { participantId } = await makeDueCommitment(fx, 'Twice');
    const token = reminderOptOutTokenFor(participantId);
    const first = await optOutOfReminders(fx.db, participantId, token);
    const second = await optOutOfReminders(fx.db, participantId, token);
    expect(first.ok && second.ok).toBe(true);
    if (second.ok) expect(second.value.optedOut).toBe(true);
  });

  it('only silences the signup that was unsubscribed from', async () => {
    // participants rows are per-signup, so the same person signing up
    // elsewhere keeps their reminders there.
    const a = await makeDueCommitment(fx, 'Signup A');
    const b = await makeDueCommitment(fx, 'Signup B');
    await optOutOfReminders(fx.db, a.participantId, reminderOptOutTokenFor(a.participantId));

    const due = (await selectDueReminders(fx.db)).map((r) => r.commitmentId);
    expect(due).not.toContain(a.commitmentId);
    expect(due).toContain(b.commitmentId);
  });

  it('preview reports the target without changing it', async () => {
    const { participantId } = await makeDueCommitment(fx, 'Preview only');
    const result = await previewReminderOptOut(
      fx.db,
      participantId,
      reminderOptOutTokenFor(participantId),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.optedOut).toBe(false);
      expect(result.value.signupTitle).toBe('Preview only');
    }
    const [row] = await fx.db
      .select({ optedOut: participants.remindersOptedOutAt })
      .from(participants)
      .where(eq(participants.id, participantId))
      .limit(1);
    expect(row?.optedOut).toBeNull();
  });

  it('does not resolve a soft-deleted signup', async () => {
    const { participantId } = await makeDueCommitment(fx, 'Deleted signup');
    await fx.db
      .update(signups)
      .set({ deletedAt: new Date() })
      .where(eq(signups.id, (await signupIdFor(fx, participantId)) ?? ''));
    const result = await previewReminderOptOut(
      fx.db,
      participantId,
      reminderOptOutTokenFor(participantId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('reports not_found for an unknown participant with a valid-shaped token', async () => {
    const ghost = makeId('par');
    const result = await optOutOfReminders(fx.db, ghost, reminderOptOutTokenFor(ghost));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });
});
