import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { participants } from '@/db/schema/participants';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { getEmailTransport } from '@/email';
import { log } from '@/lib/log';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, deleteSignup, publishSignup, updateSignup } from '@/services/signups';
import { addField } from '@/services/slot-fields';
import { addSlot, updateSlot } from '@/services/slots';
import { sendReminderJob } from './reminders';
import { selectDueSlotChanges, sendSlotChangeJob } from './slot-changes';

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
  const slug = `chg-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Change Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Change Workspace',
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

/** A date `days` from today, as a date field stores it. */
function dayFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 3600_000).toISOString().slice(0, 10);
}

interface Scenario {
  signupId: string;
  slotId: string;
  commitmentIds: string[];
}

/**
 * An open signup with a date field, one slot dated 20 days out, and `people`
 * participants holding it, each committed a week ago.
 */
async function makeScenario(
  fx: Fixture,
  title: string,
  opts: { people?: number; settings?: Record<string, unknown> } = {},
): Promise<Scenario> {
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
    {
      template: {
        id: 'slot-change-test',
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
    },
  );
  if (!created.ok) throw new Error(`createSignup failed: ${created.error.message}`);
  const signupId = created.value.id;

  const slot = await addSlot(fx.db, fx.actor, signupId, {
    values: { day: dayFromNow(20) },
    capacity: 5,
  });
  if (!slot.ok) throw new Error(`addSlot failed: ${slot.error.message}`);
  const pub = await publishSignup(fx.db, fx.actor, signupId);
  if (!pub.ok) throw new Error(`publishSignup failed: ${pub.error.message}`);

  const commitmentIds: string[] = [];
  for (let i = 0; i < (opts.people ?? 1); i++) {
    const commit = await commitToSlot(fx.db, slot.value.id, {
      name: `Change Tester ${i}`,
      email: `p${i}-${slot.value.id.slice(-10).toLowerCase()}@example.test`,
      quantity: 1,
    });
    if (!commit.ok) throw new Error(`commitToSlot failed: ${commit.error.message}`);
    commitmentIds.push(commit.value.commitment.id);
  }
  await fx.db
    .update(commitments)
    .set({ createdAt: sql`now() - make_interval(days => 7)` })
    .where(eq(commitments.slotId, slot.value.id));

  return { signupId, slotId: slot.value.id, commitmentIds };
}

async function moveSlot(fx: Fixture, slotId: string, day: string) {
  const moved = await updateSlot(fx.db, fx.actor, slotId, { values: { day } });
  if (!moved.ok) throw new Error(`updateSlot failed: ${moved.error.message}`);
  return moved.value;
}

/** Pushes the slot's recorded moves `minutes` into the past, as if time passed. */
async function ageMoves(db: Db, signupId: string, minutes: number) {
  await db
    .update(activity)
    .set({ occurredAt: sql`${activity.occurredAt} - make_interval(mins => ${minutes})` })
    .where(and(eq(activity.signupId, signupId), eq(activity.eventType, 'slot.rescheduled')));
}

async function changeSentRows(db: Db, commitmentId: string) {
  return db
    .select({ payload: activity.payload })
    .from(activity)
    .where(
      and(
        eq(activity.eventType, 'slot.change_sent'),
        sql`(${activity.payload}->>'commitmentId') = ${commitmentId}`,
      ),
    );
}

describe('slot-change emails (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  async function dueIds(): Promise<string[]> {
    return (await selectDueSlotChanges(fx.db)).map((r) => r.commitmentId);
  }

  /** Runs one job per due commitment of this scenario, as the dispatcher would. */
  async function runDue(scenario: Scenario) {
    const due = (await dueIds()).filter((id) => scenario.commitmentIds.includes(id));
    for (const commitmentId of due) await sendSlotChangeJob({ commitmentId });
    return due;
  }

  it('records where a slot moved from and to, and nothing for other edits', async () => {
    const s = await makeScenario(fx, 'Records moves');
    const before = await fx.db.select().from(slots).where(eq(slots.id, s.slotId));
    const capacityOnly = await updateSlot(fx.db, fx.actor, s.slotId, { capacity: 6 });
    expect(capacityOnly.ok).toBe(true);
    const sameDay = await updateSlot(fx.db, fx.actor, s.slotId, { values: { day: dayFromNow(20) } });
    expect(sameDay.ok).toBe(true);
    const moved = await moveSlot(fx, s.slotId, dayFromNow(21));

    const rows = await fx.db
      .select({ payload: activity.payload })
      .from(activity)
      .where(and(eq(activity.signupId, s.signupId), eq(activity.eventType, 'slot.rescheduled')));
    expect(rows.map((r) => r.payload)).toEqual([
      {
        slotId: s.slotId,
        from: before[0]!.slotAt!.toISOString(),
        to: moved.slotAt!.toISOString(),
      },
    ]);
  });

  it('emails each participant once, about 10 minutes after the move', async () => {
    const s = await makeScenario(fx, 'One email each', { people: 2 });
    const newDay = dayFromNow(22);
    const moved = await moveSlot(fx, s.slotId, newDay);

    // Still inside the settle time: the organizer may not be done.
    expect(await dueIds()).not.toContain(s.commitmentIds[0]);
    await ageMoves(fx.db, s.signupId, 11);
    expect((await dueIds()).filter((id) => s.commitmentIds.includes(id)).sort()).toEqual(
      [...s.commitmentIds].sort(),
    );

    const send = vi.spyOn(getEmailTransport(), 'send');
    try {
      await runDue(s);
      // A second job for the same commitment, as a later scan could queue.
      await sendSlotChangeJob({ commitmentId: s.commitmentIds[0]! });
      expect(send).toHaveBeenCalledTimes(2);
      const mail = send.mock.calls[0]![0];
      expect(mail.subject).toMatch(/^Time changed: One email each · /);
      expect(mail.text).toMatch(/moved your slot to a new\s+date or time/);
      expect(mail.text).toMatch(/Stop reminders\s+and updates for One email each/);
      expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    } finally {
      send.mockRestore();
    }

    for (const id of s.commitmentIds) {
      const rows = await changeSentRows(fx.db, id);
      expect(rows.map((r) => (r.payload as { slotAt: string }).slotAt)).toEqual([
        moved.slotAt!.toISOString(),
      ]);
    }
    expect(await dueIds()).not.toContain(s.commitmentIds[0]);
  });

  it('sends one email for several quick moves, for where the slot ended up', async () => {
    const s = await makeScenario(fx, 'Quick moves');
    await moveSlot(fx, s.slotId, dayFromNow(23));
    await ageMoves(fx.db, s.signupId, 5);
    const final = await moveSlot(fx, s.slotId, dayFromNow(24));
    // The second move restarts the wait.
    await ageMoves(fx.db, s.signupId, 6);
    expect(await dueIds()).not.toContain(s.commitmentIds[0]);
    await ageMoves(fx.db, s.signupId, 5);

    const send = vi.spyOn(getEmailTransport(), 'send');
    try {
      expect(await runDue(s)).toEqual(s.commitmentIds);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      send.mockRestore();
    }
    const rows = await changeSentRows(fx.db, s.commitmentIds[0]!);
    expect((rows[0]!.payload as { slotAt: string }).slotAt).toBe(final.slotAt!.toISOString());
  });

  it('sends nothing when the slot is moved back before anyone is told', async () => {
    const s = await makeScenario(fx, 'Moved back');
    await moveSlot(fx, s.slotId, dayFromNow(25));
    await moveSlot(fx, s.slotId, dayFromNow(20));
    await ageMoves(fx.db, s.signupId, 11);
    expect(await dueIds()).not.toContain(s.commitmentIds[0]);
  });

  it('tells a participant about a second move after the first email', async () => {
    const s = await makeScenario(fx, 'Moved twice');
    await moveSlot(fx, s.slotId, dayFromNow(26));
    await ageMoves(fx.db, s.signupId, 11);
    await runDue(s);
    expect(await dueIds()).not.toContain(s.commitmentIds[0]);

    await moveSlot(fx, s.slotId, dayFromNow(27));
    await ageMoves(fx.db, s.signupId, 11);
    expect(await dueIds()).toContain(s.commitmentIds[0]);
  });

  it('sends nothing when a field change re-times a slot that moved lately', async () => {
    const s = await makeScenario(fx, 'Re-timed by a field');
    await moveSlot(fx, s.slotId, dayFromNow(26));
    await ageMoves(fx.db, s.signupId, 11);
    expect(await runDue(s)).toEqual(s.commitmentIds);

    // A second date field, filled in without moving the slot, then made the
    // one reminders count from: the slot's time changes with no move.
    const field = await addField(fx.db, fx.actor, s.signupId, {
      ref: 'other',
      label: 'Other day',
      fieldType: 'date',
      config: { fieldType: 'date' },
    });
    if (!field.ok) throw new Error(`addField failed: ${field.error.message}`);
    await updateSlot(fx.db, fx.actor, s.slotId, {
      values: { day: dayFromNow(26), other: dayFromNow(40) },
    });
    const switched = await updateSignup(fx.db, fx.actor, s.signupId, {
      settings: { reminderFromFieldRef: 'other' },
    });
    if (!switched.ok) throw new Error(`updateSignup failed: ${switched.error.message}`);
    const [slot] = await fx.db.select().from(slots).where(eq(slots.id, s.slotId));
    expect(slot!.slotAt!.toISOString().slice(0, 10)).toBe(dayFromNow(40));

    expect(await dueIds()).not.toContain(s.commitmentIds[0]);
  });

  it('does not email someone who signed up after the move', async () => {
    const s = await makeScenario(fx, 'Signed up after', { people: 0 });
    await moveSlot(fx, s.slotId, dayFromNow(28));
    await ageMoves(fx.db, s.signupId, 11);
    const commit = await commitToSlot(fx.db, s.slotId, {
      name: 'Late Tester',
      email: `late-${s.slotId.slice(-10).toLowerCase()}@example.test`,
      quantity: 1,
    });
    if (!commit.ok) throw new Error(commit.error.message);
    expect(await dueIds()).not.toContain(commit.value.commitment.id);
  });

  it('does not email a cancelled commitment', async () => {
    const s = await makeScenario(fx, 'Cancelled');
    await fx.db
      .update(commitments)
      .set({ status: 'cancelled' })
      .where(eq(commitments.id, s.commitmentIds[0]!));
    await moveSlot(fx, s.slotId, dayFromNow(29));
    await ageMoves(fx.db, s.signupId, 11);
    expect(await dueIds()).not.toContain(s.commitmentIds[0]);
  });

  it('does not email anyone about a slot moved into the past', async () => {
    const s = await makeScenario(fx, 'Into the past');
    await moveSlot(fx, s.slotId, dayFromNow(-2));
    await ageMoves(fx.db, s.signupId, 11);
    expect(await dueIds()).not.toContain(s.commitmentIds[0]);
  });

  it('does not email when the signup has reminders off', async () => {
    const s = await makeScenario(fx, 'Reminders off', { settings: { sendReminders: false } });
    await moveSlot(fx, s.slotId, dayFromNow(30));
    await ageMoves(fx.db, s.signupId, 11);
    expect(await dueIds()).not.toContain(s.commitmentIds[0]);
  });

  it('does not email a participant who unsubscribed', async () => {
    const s = await makeScenario(fx, 'Unsubscribed');
    await fx.db
      .update(participants)
      .set({ remindersOptedOutAt: new Date() })
      .where(eq(participants.signupId, s.signupId));
    await moveSlot(fx, s.slotId, dayFromNow(31));
    await ageMoves(fx.db, s.signupId, 11);
    expect(await dueIds()).not.toContain(s.commitmentIds[0]);
  });

  // Changed while the job waits in the queue: the job asks the scan's rules
  // again and logs the one that failed.
  async function expectNoSend(commitmentId: string, reason: string) {
    const send = vi.spyOn(getEmailTransport(), 'send');
    const info = vi.spyOn(log, 'info');
    try {
      await sendSlotChangeJob({ commitmentId });
      expect(send).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith(
        { commitmentId, reasons: [reason] },
        'slot-change email no longer due; skipping',
      );
    } finally {
      send.mockRestore();
      info.mockRestore();
    }
    expect(await changeSentRows(fx.db, commitmentId)).toEqual([]);
  }

  async function dueScenario(title: string) {
    const s = await makeScenario(fx, title);
    await moveSlot(fx, s.slotId, dayFromNow(32));
    await ageMoves(fx.db, s.signupId, 11);
    expect(await dueIds()).toContain(s.commitmentIds[0]);
    return s;
  }

  it('skips the send when reminders were turned off after being enqueued', async () => {
    const s = await dueScenario('Reminders off mid-flight');
    const off = await updateSignup(fx.db, fx.actor, s.signupId, {
      settings: { sendReminders: false },
    });
    expect(off.ok).toBe(true);
    await expectNoSend(s.commitmentIds[0]!, 'reminders off');
  });

  it('skips the send when the participant unsubscribed after being enqueued', async () => {
    const s = await dueScenario('Unsubscribed mid-flight');
    await fx.db
      .update(participants)
      .set({ remindersOptedOutAt: new Date() })
      .where(eq(participants.signupId, s.signupId));
    await expectNoSend(s.commitmentIds[0]!, 'participant opted out');
  });

  it('skips the send when the signup was deleted after being enqueued', async () => {
    const s = await dueScenario('Deleted mid-flight');
    const deleted = await deleteSignup(fx.db, fx.actor, s.signupId);
    expect(deleted.ok).toBe(true);
    await expectNoSend(s.commitmentIds[0]!, 'signup deleted');
  });

  it('skips the send when the slot moved again after being enqueued', async () => {
    const s = await dueScenario('Moved mid-flight');
    await moveSlot(fx, s.slotId, dayFromNow(33));
    await expectNoSend(s.commitmentIds[0]!, 'slot still moving');
  });

  describe('the reminder that follows', () => {
    /** Brings the slot, and the times recorded for it, 20 hours from now. */
    async function bringWithinReminderLead(s: Scenario) {
      const [slot] = await fx.db.select().from(slots).where(eq(slots.id, s.slotId));
      const shift = slot!.slotAt!.getTime() - (Date.now() + 20 * 3600_000);
      await fx.db
        .update(slots)
        .set({ slotAt: new Date(slot!.slotAt!.getTime() - shift) })
        .where(eq(slots.id, s.slotId));
      await fx.db
        .update(activity)
        .set({
          payload: sql`jsonb_set(${activity.payload}, '{slotAt}', to_jsonb(
            ((${activity.payload}->>'slotAt')::timestamptz - make_interval(secs => ${shift / 1000}))
          ))`,
        })
        .where(
          and(eq(activity.signupId, s.signupId), eq(activity.eventType, 'slot.change_sent')),
        );
      // And the move that put it there, so the slot is still where it was moved to.
      await fx.db
        .update(activity)
        .set({
          payload: sql`jsonb_set(${activity.payload}, '{to}', to_jsonb(
            ((${activity.payload}->>'to')::timestamptz - make_interval(secs => ${shift / 1000}))
          ))`,
        })
        .where(
          and(eq(activity.signupId, s.signupId), eq(activity.eventType, 'slot.rescheduled')),
        );
    }

    it('reads as a normal reminder once the participant was told the new time', async () => {
      const s = await dueScenario('Told, then reminded');
      await runDue(s);
      await bringWithinReminderLead(s);
      const send = vi.spyOn(getEmailTransport(), 'send');
      try {
        await sendReminderJob({ commitmentId: s.commitmentIds[0]! });
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0]![0].subject).toMatch(/^Reminder: /);
      } finally {
        send.mockRestore();
      }
      // And the reminder, being for the time they were told, sends no change email.
      expect(await dueIds()).not.toContain(s.commitmentIds[0]);
    });

    it('says the time changed when no change email went out first', async () => {
      const s = await dueScenario('Reminded before the change email');
      await bringWithinReminderLead(s);
      const send = vi.spyOn(getEmailTransport(), 'send');
      try {
        await sendReminderJob({ commitmentId: s.commitmentIds[0]! });
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0]![0].subject).toMatch(/^Time changed: /);
        expect(send.mock.calls[0]![0].text).toMatch(/since\s+we\s+last\s+emailed\s+you/);
      } finally {
        send.mockRestore();
      }
      // The reminder told them the new time, so no change email follows.
      expect(await dueIds()).not.toContain(s.commitmentIds[0]);
    });
  });
});
