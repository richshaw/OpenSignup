import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { selectDueReminders } from './reminders';

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
): Promise<{ signupId: string; slotId: string; commitmentId: string }> {
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
  };
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

  it('honours a longer per-signup reminderLeadHours', async () => {
    const { commitmentId } = await makeScenario(fx, 'Long lead', {
      slotInHours: 40,
      settings: { reminderLeadHours: 48 },
    });
    expect(await dueIds()).toContain(commitmentId);
  });

  it('honours a shorter per-signup reminderLeadHours', async () => {
    const { commitmentId } = await makeScenario(fx, 'Short lead', {
      slotInHours: 20,
      settings: { reminderLeadHours: 2 },
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

  it('still reminds someone who committed inside a long lead window', async () => {
    // Regression: a `created_at < slot_at - lead` guard reads naturally but
    // silently denies a reminder to everyone who commits within the lead
    // window. At a 72h lead that is most participants.
    const { commitmentId } = await makeScenario(fx, 'Committed inside the window', {
      slotInHours: 60,
      committedHoursAgo: 2,
      settings: { reminderLeadHours: 72 },
    });
    expect(await dueIds()).toContain(commitmentId);
  });

  it('does not strip reminders from existing commitments when the lead time is raised', async () => {
    // Organizer moves 2h -> 72h after someone already committed.
    const { commitmentId } = await makeScenario(fx, 'Lead raised later', {
      slotInHours: 40,
      committedHoursAgo: 6,
      settings: { reminderLeadHours: 72 },
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

  it('does not select a slot with no slot_at', async () => {
    const { slotId, commitmentId } = await makeScenario(fx, 'Undated', { slotInHours: 20 });
    await fx.db.update(slots).set({ slotAt: null }).where(eq(slots.id, slotId));
    expect(await dueIds()).not.toContain(commitmentId);
  });
});
