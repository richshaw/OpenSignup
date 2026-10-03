import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { createSignup, updateSignup } from '@/services/signups';
import { PATCH } from './route';

// The route reads the organizer from the session cookie. Tests hand it one
// directly instead of going through Auth.js.
const session = vi.hoisted(() => ({ actor: { kind: 'anonymous' } as Actor }));
vi.mock('@/auth/session', () => ({ requireActor: async () => session.actor }));

function patch(signupId: string, body: unknown) {
  const req = new NextRequest(`http://localhost/api/signups/${signupId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id: signupId }) });
}

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  actor: Actor;
}

async function setupFixture(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `sp-${workspaceId.slice(-8).toLowerCase()}`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email: `${slug}@example.test` });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Signup PATCH Route Test',
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

  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${slug}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  session.actor = actor;
  return { db, workspaceId, organizerId, actor };
}

/** A signup on the default template, so it has a `what` text field and a `date` field. */
async function newSignup(fx: Fixture, title: string) {
  const created = await createSignup(fx.db, fx.actor, fx.workspaceId, {
    title,
    description: '',
    tags: [],
    visibility: 'unlisted' as const,
    settings: {},
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.value.id;
}

async function settingsOf(fx: Fixture, signupId: string) {
  const [row] = await fx.db
    .select({ settings: signups.settings })
    .from(signups)
    .where(eq(signups.id, signupId));
  return row?.settings as Record<string, unknown>;
}

describe('PATCH /api/signups/[id] settings (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupFixture();
  });

  afterAll(async () => {
    if (!fx) return; // setup failed: let its own error show
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it('a "Group slots by" save leaves reminders as an assistant set them after the page opened (#314)', async () => {
    const id = await newSignup(fx, 'Group by after assistant');
    // What update_signup does when an assistant turns reminders off.
    const off = await updateSignup(fx.db, fx.actor, id, { settings: { sendReminders: false } });
    if (!off.ok) throw new Error(off.error.message);
    const before = await settingsOf(fx, id);

    // The Build tab, opened before that, sends only the key it changed.
    const res = await patch(id, { settings: { groupByFieldRefs: ['what'] } });
    expect(res.status).toBe(200);

    expect(await settingsOf(fx, id)).toEqual({ ...before, groupByFieldRefs: ['what'] });
  });

  it('a reminder field save leaves the grouping set in another tab', async () => {
    const id = await newSignup(fx, 'Reminder after other tab');
    const grouped = await patch(id, { settings: { groupByFieldRefs: ['what'] } });
    expect(grouped.status).toBe(200);
    const off = await patch(id, { settings: { sendReminders: false } });
    expect(off.status).toBe(200);
    const before = await settingsOf(fx, id);
    expect(before).toMatchObject({
      groupByFieldRefs: ['what'],
      sendReminders: false,
      reminderFromFieldRef: 'date',
    });

    const on = await patch(id, { settings: { sendReminders: true, reminderFromFieldRef: 'date' } });
    expect(on.status).toBe(200);

    expect(await settingsOf(fx, id)).toEqual({ ...before, sendReminders: true });
  });
});
