import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { getEmailTransport } from '@/email';
import { log } from '@/lib/log';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { removeParticipantEmail } from '@/services/testing/participants';
import { selectDueReminders, sendReminderJob } from './reminders';

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
  const slug = `rem-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Reminder Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Reminder Workspace',
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

interface ScenarioOptions {
  /** Hours from now that the slot happens. Negative means already past. */
  slotInHours: number;
  /** Hours ago the participant committed. Defaults to a week. */
  committedHoursAgo?: number;
  settings?: Record<string, unknown>;
}

/**
 * Builds an open signup with one committed participant, then rewrites slot_at
 * and commitments.created_at directly so each test can place itself precisely
 * relative to the reminder lead time.
 */
async function makeScenario(
  fx: Fixture,
  title: string,
  opts: ScenarioOptions,
): Promise<{ signupId: string; slotId: string; commitmentId: string; participantId: string }> {
  const created = await createSignup(fx.db, fx.actor, fx.workspaceId, {
    title,
    description: '',
    tags: [],
    visibility: 'unlisted' as const,
    settings: opts.settings ?? {},
  });
  if (!created.ok) throw new Error(`createSignup failed: ${created.error.message}`);

  const slot = await addSlot(fx.db, fx.actor, created.value.id, { values: {}, capacity: 5 });
  if (!slot.ok) throw new Error(`addSlot failed: ${slot.error.message}`);

  const pub = await publishSignup(fx.db, fx.actor, created.value.id);
  if (!pub.ok) throw new Error(`publishSignup failed: ${pub.error.message}`);

  const commit = await commitToSlot(fx.db, slot.value.id, {
    name: 'Reminder Tester',
    email: `${slot.value.id.slice(-10).toLowerCase()}@example.test`,
    quantity: 1,
  });
  if (!commit.ok) throw new Error(`commitToSlot failed: ${commit.error.message}`);

  await fx.db
    .update(slots)
    .set({ slotAt: sql`now() + make_interval(mins => ${Math.round(opts.slotInHours * 60)})` })
    .where(eq(slots.id, slot.value.id));

  await fx.db
    .update(commitments)
    .set({
      createdAt: sql`now() - make_interval(hours => ${opts.committedHoursAgo ?? 24 * 7})`,
    })
    .where(eq(commitments.id, commit.value.commitment.id));

  return {
    signupId: created.value.id,
    slotId: slot.value.id,
    commitmentId: commit.value.commitment.id,
    participantId: commit.value.commitment.participantId,
  };
}

async function reminderSentRows(db: Db, commitmentId: string): Promise<number> {
  const rows = await db
    .select({ id: activity.id })
    .from(activity)
    .where(
      and(
        eq(activity.eventType, 'reminder.sent'),
        sql`(${activity.payload}->>'commitmentId') = ${commitmentId}`,
      ),
    );
  return rows.length;
}

describe('selectDueReminders (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  async function dueIds(): Promise<string[]> {
    const rows = await selectDueReminders(fx.db);
    return rows.map((r) => r.commitmentId);
  }

  it('selects a commitment inside the default 24h lead time', async () => {
    const { commitmentId } = await makeScenario(fx, 'Due tomorrow', { slotInHours: 20 });
    expect(await dueIds()).toContain(commitmentId);
  });

  it('does not select a slot still beyond the lead time', async () => {
    const { commitmentId } = await makeScenario(fx, 'Not due yet', { slotInHours: 40 });
    expect(await dueIds()).not.toContain(commitmentId);
  });

  it('ignores a legacy reminderLeadHours left in settings', async () => {
    // The lead is fixed at 24h. A stored value from before that survives only
    // until migration 0005 strips it, and must not change the timing meanwhile.
    const { commitmentId } = await makeScenario(fx, 'Legacy lead', {
      slotInHours: 40,
      settings: { reminderLeadHours: 48 },
    });
    expect(await dueIds()).not.toContain(commitmentId);
  });

  it('still selects a reminder whose moment passed while the worker was down', async () => {
    // The old fixed [47h, 49h] window dropped these permanently.
    const { commitmentId } = await makeScenario(fx, 'Worker was down', { slotInHours: 2 });
    expect(await dueIds()).toContain(commitmentId);
  });

  it('does not select a slot that has already started', async () => {
    const { commitmentId } = await makeScenario(fx, 'Already happened', { slotInHours: -2 });
    expect(await dueIds()).not.toContain(commitmentId);
  });

  it('does not remind someone who signed up minutes ago', async () => {
    const { commitmentId } = await makeScenario(fx, 'Just signed up', {
      slotInHours: 6,
      committedHoursAgo: 0,
    });
    expect(await dueIds()).not.toContain(commitmentId);
  });

  it('still reminds someone who committed inside the lead window', async () => {
    // Regression: a `created_at < slot_at - lead` guard reads naturally but
    // silently denies a reminder to everyone who commits within the lead
    // window — at 24h, everyone who signs up the day before.
    const { commitmentId } = await makeScenario(fx, 'Committed inside the window', {
      slotInHours: 20,
      committedHoursAgo: 2,
    });
    expect(await dueIds()).toContain(commitmentId);
  });

  it('respects sendReminders=false', async () => {
    const { commitmentId } = await makeScenario(fx, 'Reminders off', {
      slotInHours: 20,
      settings: { sendReminders: false },
    });
    expect(await dueIds()).not.toContain(commitmentId);
  });

  it('does not select a commitment that already has a reminder.sent row', async () => {
    const { signupId, commitmentId } = await makeScenario(fx, 'Already reminded', {
      slotInHours: 20,
    });
    expect(await dueIds()).toContain(commitmentId);

    await fx.db.insert(activity).values({
      id: makeId('act'),
      signupId,
      workspaceId: fx.workspaceId,
      actorId: null,
      actorType: 'system',
      eventType: 'reminder.sent',
      payload: { commitmentId, channel: 'email' },
    });

    expect(await dueIds()).not.toContain(commitmentId);
  });

  it('does not select a cancelled commitment', async () => {
    const { commitmentId } = await makeScenario(fx, 'Cancelled', { slotInHours: 20 });
    await fx.db
      .update(commitments)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(eq(commitments.id, commitmentId));
    expect(await dueIds()).not.toContain(commitmentId);
  });

  it('still reminds participants after the organizer closes the signup', async () => {
    // Closing means "no longer collecting responses", not "cancelled" — the
    // commitments already made stay valid. Excluding closed signups silently
    // cancelled reminders whenever an organizer tidied up after sign-ups ended,
    // which at a 24h lead is an ordinary thing to do the evening before.
    const { signupId, commitmentId } = await makeScenario(fx, 'Closed signup', {
      slotInHours: 20,
    });
    await fx.db.update(signups).set({ status: 'closed' }).where(eq(signups.id, signupId));
    expect(await dueIds()).toContain(commitmentId);
  });

  it.each(['draft', 'archived'])('does not select a commitment on a %s signup', async (status) => {
    const { signupId, commitmentId } = await makeScenario(fx, `Signup ${status}`, {
      slotInHours: 20,
    });
    await fx.db.update(signups).set({ status }).where(eq(signups.id, signupId));
    expect(await dueIds()).not.toContain(commitmentId);
  });

  it('skips the send when the participant opted out after being enqueued', async () => {
    // The dispatcher filter can't cover this: the opt-out link lives in the
    // previous reminder, so acting on it lands between enqueue and send.
    const { commitmentId, signupId } = await makeScenario(fx, 'Opted out mid-flight', {
      slotInHours: 20,
    });
    await fx.db
      .update(participants)
      .set({ remindersOptedOutAt: new Date() })
      .where(eq(participants.signupId, signupId));

    await expectNoSend(commitmentId, 'participant opted out');
  });

  // The scan's other conditions, changed while the job waits in the queue. A
  // backed-up queue or a stopped worker can stretch that wait to hours. The
  // job logs the rule the commitment failed, so a missing reminder can be
  // explained from the worker's log.
  async function expectNoSend(commitmentId: string, reason: string) {
    const send = vi.spyOn(getEmailTransport(), 'send');
    const info = vi.spyOn(log, 'info');
    try {
      await sendReminderJob({ commitmentId });
      expect(send).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith(
        { commitmentId, reasons: [reason] },
        'reminder no longer due; skipping',
      );
    } finally {
      send.mockRestore();
      info.mockRestore();
    }
    expect(await reminderSentRows(fx.db, commitmentId)).toBe(0);
  }

  it('warns when the commitment does not exist', async () => {
    const warn = vi.spyOn(log, 'warn');
    try {
      await sendReminderJob({ commitmentId: makeId('com') });
      expect(warn).toHaveBeenCalledWith(
        { commitmentId: expect.any(String) },
        'commitment not found for reminder',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('skips the send when the signup was archived after being enqueued', async () => {
    const { commitmentId, signupId } = await makeScenario(fx, 'Archived mid-flight', {
      slotInHours: 20,
    });
    expect(await dueIds()).toContain(commitmentId);
    await fx.db.update(signups).set({ status: 'archived' }).where(eq(signups.id, signupId));

    await expectNoSend(commitmentId, 'signup not open or closed');
  });

  it('skips the send when reminders were turned off after being enqueued', async () => {
    const { commitmentId, signupId } = await makeScenario(fx, 'Reminders off mid-flight', {
      slotInHours: 20,
    });
    expect(await dueIds()).toContain(commitmentId);
    await fx.db
      .update(signups)
      .set({ settings: { sendReminders: false } })
      .where(eq(signups.id, signupId));

    await expectNoSend(commitmentId, 'reminders off');
  });

  it('skips the send when the slot has passed since being enqueued', async () => {
    const { commitmentId, slotId } = await makeScenario(fx, 'Slot passed mid-flight', {
      slotInHours: 20,
    });
    expect(await dueIds()).toContain(commitmentId);
    await fx.db
      .update(slots)
      .set({ slotAt: sql`now() - make_interval(hours => 2)` })
      .where(eq(slots.id, slotId));

    await expectNoSend(commitmentId, 'slot passed');
  });

  it('skips the send when the slot moved beyond the lead time since being enqueued', async () => {
    // Editing a slot's values, or changing the reminder field, recomputes
    // slot_at. A job queued for the old time must not send days early; a later
    // scan picks the commitment up when it is truly due.
    const { commitmentId, slotId } = await makeScenario(fx, 'Slot moved later mid-flight', {
      slotInHours: 20,
    });
    expect(await dueIds()).toContain(commitmentId);
    await fx.db
      .update(slots)
      .set({ slotAt: sql`now() + make_interval(hours => 72)` })
      .where(eq(slots.id, slotId));

    await expectNoSend(commitmentId, 'slot beyond the lead time');
  });

  it('still sends to a closed signup with reminders on and the slot ahead', async () => {
    const { commitmentId, signupId } = await makeScenario(fx, 'Closed, still sends', {
      slotInHours: 20,
    });
    await fx.db.update(signups).set({ status: 'closed' }).where(eq(signups.id, signupId));

    await sendReminderJob({ commitmentId });

    expect(await reminderSentRows(fx.db, commitmentId)).toBe(1);
  });

  it('sends once when a second job for the same commitment runs after the first', async () => {
    // The queue does not dedupe, so a commitment still due at the next scan
    // gets another job; the reminder.sent row the first one records stops it.
    const { commitmentId } = await makeScenario(fx, 'Two jobs, one email', { slotInHours: 20 });
    const send = vi.spyOn(getEmailTransport(), 'send');
    try {
      await sendReminderJob({ commitmentId });
      await sendReminderJob({ commitmentId });
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      send.mockRestore();
    }
    expect(await reminderSentRows(fx.db, commitmentId)).toBe(1);
  });

  it('does not select a participant without an email', async () => {
    const { commitmentId, participantId } = await makeScenario(fx, 'No email given', {
      slotInHours: 20,
    });
    expect(await dueIds()).toContain(commitmentId);
    await removeParticipantEmail(fx.db, participantId);
    expect(await dueIds()).not.toContain(commitmentId);
  });

  it('skips the send for a participant without an email', async () => {
    // The scan leaves them out; the job asks the same condition again of the
    // row it reads after the scan.
    const { commitmentId, participantId } = await makeScenario(fx, 'No email at send time', {
      slotInHours: 20,
    });
    await removeParticipantEmail(fx.db, participantId);

    await expectNoSend(commitmentId, 'participant has no email');
  });

  it('does not select a slot with no slot_at', async () => {
    const { slotId, commitmentId } = await makeScenario(fx, 'Undated', { slotInHours: 20 });
    await fx.db.update(slots).set({ slotAt: null }).where(eq(slots.id, slotId));
    expect(await dueIds()).not.toContain(commitmentId);
  });
});
