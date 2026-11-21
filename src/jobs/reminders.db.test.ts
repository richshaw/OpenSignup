import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
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
import { ship } from '@/i18n/testing/ship';
import { log } from '@/lib/log';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup, updateSignup } from '@/services/signups';
import { deleteField, listFieldsForSignup, updateField } from '@/services/slot-fields';
import { addSlot, updateSlot } from '@/services/slots';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { removeParticipantEmail } from '@/services/testing/participants';
import { SLOT_CHANGE_SETTLE_MINUTES } from '@/lib/reminder-eligibility';
import { selectDueReminders, sendReminderJob } from './reminders';
import { sendSlotChangeJob } from './slot-changes';

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
  /** Give the signup a date field, `day`, so `updateSlot` can move the slot. */
  dated?: boolean;
  /** The signup's fields, in place of `dated`'s one. */
  fields?: Omit<SlotFieldDefinition, 'id'>[];
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
  const created = await createSignup(
    fx.db,
    fx.actor,
    fx.workspaceId,
    {
      title,
      description: '',
      tags: [],
      visibility: 'unlisted' as const,
      settings: opts.settings ?? {},
    },
    opts.fields
      ? { template: { id: 'reminder-test', fields: opts.fields, slots: [] } }
      : opts.dated
        ? {
            template: {
              id: 'reminder-test',
              fields: [
                {
                  ref: 'day',
                  label: 'Day',
                  fieldType: 'date',
                  sortOrder: 0,
                  config: { fieldType: 'date' },
                },
              ],
              slots: [],
            },
          }
        : {},
  );
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

/**
 * Moves the slot the way the organizer does, through `updateSlot`, which
 * records the move, then places its new time `hoursAhead` from now.
 */
async function moveSlotTo(fx: Fixture, slotId: string, day: string, hoursAhead: number) {
  const moved = await updateSlot(fx.db, fx.actor, slotId, { values: { day } });
  if (!moved.ok) throw new Error(`updateSlot failed: ${moved.error.message}`);
  await fx.db
    .update(slots)
    .set({ slotAt: sql`now() + make_interval(mins => ${Math.round(hoursAhead * 60)})` })
    .where(eq(slots.id, slotId));
}

/** Pushes everything the signup's activity log records `minutes` into the past, as if time passed. */
async function ageActivity(db: Db, signupId: string, minutes: number) {
  await db
    .update(activity)
    .set({ occurredAt: sql`${activity.occurredAt} - make_interval(mins => ${minutes})` })
    .where(eq(activity.signupId, signupId));
}

/** Pushes the signup's recorded slot moves `minutes` into the past, as if time passed. */
async function ageMoves(db: Db, signupId: string, minutes: number) {
  await db
    .update(activity)
    .set({ occurredAt: sql`${activity.occurredAt} - make_interval(mins => ${minutes})` })
    .where(and(eq(activity.signupId, signupId), eq(activity.eventType, 'slot.rescheduled')));
}

/**
 * A slot a field change re-timed, put back inside the lead time as if time
 * passed: the slot 20 hours from now, and its reminder's recorded time moved
 * the same way, so the two still differ by what the field change did. `from`
 * is the instant the slot's values gave before the change.
 */
async function letTimePass(db: Db, slotId: string, commitmentId: string, from: Date) {
  const [slot] = await db.select({ slotAt: slots.slotAt }).from(slots).where(eq(slots.id, slotId));
  const to = slot!.slotAt!;
  expect(to.getTime()).not.toBe(from.getTime());
  const slotAt = new Date(Date.now() + 20 * 3600_000);
  const remindedFor = new Date(slotAt.getTime() - (to.getTime() - from.getTime()));
  await db.update(slots).set({ slotAt }).where(eq(slots.id, slotId));
  await db
    .update(activity)
    .set({
      payload: sql`jsonb_set(${activity.payload}, '{slotAt}', to_jsonb(${remindedFor.toISOString()}::text))`,
    })
    .where(
      and(
        eq(activity.eventType, 'reminder.sent'),
        sql`(${activity.payload}->>'commitmentId') = ${commitmentId}`,
      ),
    );
}

/**
 * Moves the slot's time, and every slot time the signup's activity records,
 * `ms` earlier, as if that much time passed.
 */
async function letTimePassBy(db: Db, signupId: string, slotId: string, ms: number) {
  const secs = ms / 1000;
  await db
    .update(slots)
    .set({ slotAt: sql`${slots.slotAt} - make_interval(secs => ${secs})` })
    .where(eq(slots.id, slotId));
  for (const key of ['slotAt', 'from', 'to']) {
    await db
      .update(activity)
      .set({
        payload: sql`jsonb_set(${activity.payload}, ${`{${key}}`}::text[], to_jsonb(
          (${activity.payload}->>${key})::timestamptz - make_interval(secs => ${secs})
        ))`,
      })
      .where(
        and(
          eq(activity.signupId, signupId),
          // A slot move's `from` and `to`, and the time an email was for.
          key === 'slotAt' ? undefined : eq(activity.eventType, 'slot.rescheduled'),
          sql`jsonb_typeof(${activity.payload}->${key}) = 'string'`,
        ),
      );
  }
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

  it('waits for a slot moved into the lead time to settle before reminding', async () => {
    // One move by the organizer is often several saves. A reminder sent
    // between them names a time that never stuck.
    const { commitmentId, signupId, slotId } = await makeScenario(fx, 'Moved into the lead', {
      slotInHours: 24 * 20,
      dated: true,
    });
    expect(await dueIds()).not.toContain(commitmentId);
    const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
    await moveSlotTo(fx, slotId, tomorrow, 20);

    expect(await dueIds()).not.toContain(commitmentId);
    await ageMoves(fx.db, signupId, SLOT_CHANGE_SETTLE_MINUTES - 1);
    expect(await dueIds()).not.toContain(commitmentId);
    await ageMoves(fx.db, signupId, 2);
    expect(await dueIds()).toContain(commitmentId);
  });

  it('skips the send when the slot moved again after being enqueued', async () => {
    const { commitmentId, signupId, slotId } = await makeScenario(fx, 'Moved after enqueue', {
      slotInHours: 24 * 20,
      dated: true,
    });
    const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
    await moveSlotTo(fx, slotId, tomorrow, 20);
    await ageMoves(fx.db, signupId, SLOT_CHANGE_SETTLE_MINUTES + 1);
    expect(await dueIds()).toContain(commitmentId);

    // The organizer corrects the time while the job waits in the queue.
    const later = new Date(Date.now() + 3 * 24 * 3600_000).toISOString().slice(0, 10);
    await moveSlotTo(fx, slotId, later, 18);
    await expectNoSend(commitmentId, 'slot still moving');
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

  it('reminds again when the organizer moves the slot after its reminder went out', async () => {
    const { commitmentId, slotId, signupId } = await makeScenario(fx, 'Moved after its reminder', {
      slotInHours: 20,
      dated: true,
    });
    const send = vi.spyOn(getEmailTransport(), 'send');
    try {
      await sendReminderJob({ commitmentId });
      expect(await reminderSentRows(fx.db, commitmentId)).toBe(1);
      expect(await dueIds()).not.toContain(commitmentId);
      const first = send.mock.calls[0]![0];
      expect(first.subject).toMatch(/^Reminder: /);
      expect(first.text).toContain('this is a reminder that you signed up for');

      // The organizer postpones the slot by about a week.
      const weekLater = new Date(Date.now() + 8 * 24 * 3600_000).toISOString().slice(0, 10);
      const moved = await updateSlot(fx.db, fx.actor, slotId, { values: { day: weekLater } });
      if (!moved.ok) throw new Error(`updateSlot failed: ${moved.error.message}`);
      expect(await dueIds()).not.toContain(commitmentId);

      // The week passes: every stored instant moves the same distance closer to
      // now, until the new time is 20 hours away and inside the lead time.
      const elapsed = moved.value.slotAt!.getTime() - (Date.now() + 20 * 3600_000);
      await letTimePassBy(fx.db, signupId, slotId, elapsed);
      // The reminder went out before the move, and still did after the week.
      await ageActivity(fx.db, signupId, 7 * 24 * 60);

      expect(await dueIds()).toContain(commitmentId);
      await sendReminderJob({ commitmentId });
      expect(await reminderSentRows(fx.db, commitmentId)).toBe(2);

      // The second reminder says the slot changed, or it reads as a duplicate.
      expect(send).toHaveBeenCalledTimes(2);
      const second = send.mock.calls[1]![0];
      expect(second.subject).toMatch(/^Time changed: /);
      expect(second.html).toContain('Your slot has changed');
      expect(second.text).toContain('since we last emailed you. Here are the new details.');
    } finally {
      send.mockRestore();
    }
  });

  it('says how many spots the participant took when it is more than one', async () => {
    const several = await makeScenario(fx, 'Spots taken', { slotInHours: 20 });
    const one = await makeScenario(fx, 'One spot taken', { slotInHours: 20 });
    await fx.db
      .update(commitments)
      .set({ quantity: 3 })
      .where(eq(commitments.id, several.commitmentId));
    const send = vi.spyOn(getEmailTransport(), 'send');
    try {
      await sendReminderJob({ commitmentId: several.commitmentId });
      await sendReminderJob({ commitmentId: one.commitmentId });
      const [forSeveral, forOne] = send.mock.calls.map(([mail]) => mail);
      expect(forSeveral?.text).toContain('Spots: 3');
      expect(forOne?.text).not.toContain('Spots:');
    } finally {
      send.mockRestore();
    }
  });

  it('greets the name the reminded sign-up was made under', async () => {
    const first = await makeScenario(fx, 'Two names, one email', { slotInHours: 20 });
    const [p] = await fx.db
      .select({ email: participants.email })
      .from(participants)
      .where(eq(participants.id, first.participantId));
    const second = await addSlot(fx.db, fx.actor, first.signupId, { values: {}, capacity: 5 });
    if (!second.ok) throw new Error(`addSlot failed: ${second.error.message}`);
    const later = await commitToSlot(fx.db, second.value.id, {
      name: 'Sam Example',
      email: p!.email!,
      quantity: 1,
    });
    if (!later.ok) throw new Error(`commitToSlot failed: ${later.error.message}`);
    expect(later.value.commitment.participantId).toBe(first.participantId);

    const send = vi.spyOn(getEmailTransport(), 'send');
    try {
      await sendReminderJob({ commitmentId: first.commitmentId });
      const [mail] = send.mock.calls.map(([m]) => m);
      expect(mail?.text).toContain('Reminder Tester');
      expect(mail?.text).not.toContain('Sam Example');
    } finally {
      send.mockRestore();
    }
  });

  describe('a field change after the reminder went out', () => {
    const day = new Date(Date.now() + 10 * 24 * 3600_000).toISOString().slice(0, 10);
    const dayAfter = new Date(Date.now() + 11 * 24 * 3600_000).toISOString().slice(0, 10);
    const dayField = {
      ref: 'day',
      label: 'Day',
      fieldType: 'date',
      sortOrder: 0,
      config: { fieldType: 'date' },
    } as const;

    /**
     * Sends the reminder for a slot with these fields and values, makes the
     * field change, lets time pass, and checks the reminder isn't sent again.
     * `from` is the instant the values give before the change.
     */
    async function expectOneReminder(
      title: string,
      fields: Omit<SlotFieldDefinition, 'id'>[],
      values: Record<string, string>,
      from: string,
      change: (signupId: string, fields: SlotFieldDefinition[]) => Promise<{ ok: boolean }>,
    ) {
      const { signupId, slotId, commitmentId } = await makeScenario(fx, title, {
        slotInHours: 20,
        fields,
      });
      await fx.db.update(slots).set({ values }).where(eq(slots.id, slotId));
      const send = vi.spyOn(getEmailTransport(), 'send');
      try {
        await sendReminderJob({ commitmentId });
        expect(send).toHaveBeenCalledTimes(1);

        const changed = await change(signupId, await listFieldsForSignup(fx.db, signupId));
        expect(changed.ok, JSON.stringify(changed)).toBe(true);
        await letTimePass(fx.db, slotId, commitmentId, new Date(from));
        const moves = await fx.db
          .select({ id: activity.id })
          .from(activity)
          .where(and(eq(activity.signupId, signupId), eq(activity.eventType, 'slot.rescheduled')));
        expect(moves).toEqual([]);

        expect(await dueIds()).not.toContain(commitmentId);
        await sendReminderJob({ commitmentId });
        expect(send).toHaveBeenCalledTimes(1);
        expect(await reminderSentRows(fx.db, commitmentId)).toBe(1);
      } finally {
        send.mockRestore();
      }
    }

    const whenField = {
      ref: 'when',
      label: 'When',
      fieldType: 'text',
      sortOrder: 1,
      config: { fieldType: 'text', maxLength: 200 },
    } as const;

    it('reads as a plain reminder when a field change, not a move, gave the slot its time', async () => {
      const { signupId, slotId, commitmentId } = await makeScenario(fx, 'Told, then retyped', {
        slotInHours: 20,
        fields: [dayField, whenField],
      });
      const send = vi.spyOn(getEmailTransport(), 'send');
      try {
        // The organizer moves the slot, and the participant is told its new time.
        const moved = await updateSlot(fx.db, fx.actor, slotId, { values: { day, when: '13:00' } });
        if (!moved.ok) throw new Error(`updateSlot failed: ${moved.error.message}`);
        await ageMoves(fx.db, signupId, 11);
        await sendSlotChangeJob({ commitmentId });
        expect(send).toHaveBeenCalledTimes(1);

        // Retyping the text field to Time gives the slot a new instant, though
        // its date and time didn't change.
        const fields = await listFieldsForSignup(fx.db, signupId);
        const retyped = await updateField(
          fx.db,
          fx.actor,
          fields.find((f) => f.ref === 'when')!.id,
          {
            fieldType: 'time',
            config: { fieldType: 'time' },
          },
        );
        expect(retyped.ok, JSON.stringify(retyped)).toBe(true);
        const [slot] = await fx.db.select().from(slots).where(eq(slots.id, slotId));
        expect(slot!.slotAt!.toISOString()).toBe(`${day}T13:00:00.000Z`);
        await letTimePassBy(
          fx.db,
          signupId,
          slotId,
          slot!.slotAt!.getTime() - (Date.now() + 20 * 3600_000),
        );

        await sendReminderJob({ commitmentId });
        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1]![0].subject).toMatch(/^Reminder: /);
      } finally {
        send.mockRestore();
      }
    });

    it('does not remind again when a text field is retyped to Time', async () => {
      await expectOneReminder(
        'Retyped to Time',
        [
          dayField,
          {
            ref: 'when',
            label: 'When',
            fieldType: 'text',
            sortOrder: 1,
            config: { fieldType: 'text', maxLength: 200 },
          },
        ],
        { day, when: '13:00' },
        `${day}T12:00:00.000Z`,
        (_, fields) =>
          updateField(fx.db, fx.actor, fields.find((f) => f.ref === 'when')!.id, {
            fieldType: 'time',
            config: { fieldType: 'time' },
          }),
      );
    });

    it('does not remind again when a Time field is deleted', async () => {
      await expectOneReminder(
        'Time deleted',
        [
          dayField,
          {
            ref: 'at',
            label: 'At',
            fieldType: 'time',
            sortOrder: 1,
            config: { fieldType: 'time' },
          },
        ],
        { day, at: '18:30' },
        `${day}T18:30:00.000Z`,
        (_, fields) => deleteField(fx.db, fx.actor, fields.find((f) => f.ref === 'at')!.id),
      );
    });

    it('does not remind again when reminders follow another date field', async () => {
      await expectOneReminder(
        'Other date followed',
        [
          dayField,
          {
            ref: 'other',
            label: 'Other',
            fieldType: 'date',
            sortOrder: 1,
            config: { fieldType: 'date' },
          },
        ],
        { day, other: dayAfter },
        `${day}T12:00:00.000Z`,
        (signupId) =>
          updateSignup(fx.db, fx.actor, signupId, { settings: { reminderFromFieldRef: 'other' } }),
      );
    });
  });

  it('writes the reminder in the signup’s language', async () => {
    ship('participant', ['en', 'sv']);
    const english = await makeScenario(fx, 'Spring fair', { slotInHours: 20, dated: true });
    const swedish = await makeScenario(fx, 'Vårloppis', {
      slotInHours: 20,
      dated: true,
      settings: { locale: 'sv' },
    });
    // The slot's date as a value; its time to remind stays where the scenario put it.
    await fx.db
      .update(slots)
      .set({ values: { day: '2026-05-02' } })
      .where(inArray(slots.id, [english.slotId, swedish.slotId]));
    const send = vi.spyOn(getEmailTransport(), 'send');
    try {
      await sendReminderJob({ commitmentId: english.commitmentId });
      await sendReminderJob({ commitmentId: swedish.commitmentId });
      const [inEnglish, inSwedish] = send.mock.calls.map(([mail]) => mail);
      // Plain text wraps at 80 columns, so any space may come out as a newline.
      const flat = (text: string | undefined) => text?.replace(/\s+/g, ' ');
      expect(inEnglish?.subject).toBe('Reminder: Spring fair · Sat, May 2');
      expect(inEnglish?.html).toMatch(/<html[^>]* lang="en"/);
      expect(flat(inEnglish?.text)).toContain(
        'Hi Reminder Tester, this is a reminder that you signed up for Spring fair. Day: Sat, May 2',
      );
      expect(flat(inEnglish?.text)).toContain('Stop reminders for Spring fair');
      expect(inSwedish?.subject).toBe('Påminnelse: Vårloppis · lör 2 maj');
      expect(inSwedish?.html).toMatch(/<html[^>]* lang="sv"/);
      // The body, from the heading to the opt-out link; the slot's label is
      // the organizer's own.
      expect(flat(inSwedish?.text)).toContain(
        'SNART DAGS Hej Reminder Tester, det här är en påminnelse om att du har anmält dig till Vårloppis. Day: lör 2 maj Visa eller ändra din anmälan',
      );
      expect(flat(inSwedish?.text)).toContain(
        'Du får fortfarande en bekräftelse om du anmäler dig till något nytt. Stäng av påminnelser om Vårloppis http',
      );
      // The preview text inboxes show after the subject is the subject.
      expect(inSwedish?.html).toContain(`>${inSwedish?.subject}<`);
    } finally {
      send.mockRestore();
    }
  });

  it('records the slot time each reminder was for', async () => {
    const { commitmentId, slotId } = await makeScenario(fx, 'Reminder names its time', {
      slotInHours: 20,
    });
    await sendReminderJob({ commitmentId });
    const [slot] = await fx.db.select().from(slots).where(eq(slots.id, slotId));
    const [row] = await fx.db
      .select({ payload: activity.payload })
      .from(activity)
      .where(
        and(
          eq(activity.eventType, 'reminder.sent'),
          sql`(${activity.payload}->>'commitmentId') = ${commitmentId}`,
        ),
      );
    expect(row?.payload).toMatchObject({ slotAt: slot!.slotAt!.toISOString() });
  });

  it('does not send again for a reminder.sent row that names no slot time', async () => {
    // Rows written before reminders recorded their slot time still count as
    // sent, whatever the slot's time is now, so a deploy sends nothing twice.
    const { signupId, commitmentId, slotId } = await makeScenario(fx, 'Reminded before', {
      slotInHours: 20,
    });
    await fx.db.insert(activity).values({
      id: makeId('act'),
      signupId,
      workspaceId: fx.workspaceId,
      actorId: null,
      actorType: 'system',
      eventType: 'reminder.sent',
      payload: { commitmentId, channel: 'email' },
    });
    await fx.db
      .update(slots)
      .set({ slotAt: sql`now() + make_interval(hours => 10)` })
      .where(eq(slots.id, slotId));
    expect(await dueIds()).not.toContain(commitmentId);

    const send = vi.spyOn(getEmailTransport(), 'send');
    try {
      await sendReminderJob({ commitmentId });
      expect(send).not.toHaveBeenCalled();
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
