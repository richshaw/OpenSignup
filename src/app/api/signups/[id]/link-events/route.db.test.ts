import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { rateLimits } from '@/db/schema/rate-limits';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { createSignup, deleteSignup } from '@/services/signups';
import { POST } from './route';

// The route reads the organizer from the session cookie. Tests hand it one
// directly instead of going through Auth.js.
const session = vi.hoisted(() => ({ actor: { kind: 'anonymous' } as Actor }));
vi.mock('@/auth/session', () => ({ requireActor: async () => session.actor }));

function beacon(signupId: string, query: string) {
  const req = new NextRequest(`http://localhost/api/signups/${signupId}/link-events?${query}`, {
    method: 'POST',
  });
  return POST(req, { params: Promise.resolve({ id: signupId }) });
}

describe('POST /api/signups/[id]/link-events (db)', () => {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `le-${workspaceId.slice(-8).toLowerCase()}`;
  const owner: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${slug}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  let signupId: string;

  const rows = (eventType: 'signup.link_copied') =>
    db
      .select({ actorId: activity.actorId, payload: activity.payload })
      .from(activity)
      .where(and(eq(activity.signupId, signupId), eq(activity.eventType, eventType)));

  beforeAll(async () => {
    await db.transaction(async (tx) => {
      await tx.insert(organizers).values({ id: organizerId, email: owner.email });
      await tx.insert(workspaces).values({
        id: workspaceId,
        slug,
        name: 'Link Events Test',
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
    const created = await createSignup(db, owner, workspaceId, {
      title: 'Snack duty',
      description: '',
      tags: [],
      visibility: 'unlisted',
      settings: {},
    });
    if (!created.ok) throw new Error(created.error.message);
    signupId = created.value.id;
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  });

  beforeEach(async () => {
    session.actor = owner;
    await db.delete(activity).where(eq(activity.signupId, signupId));
  });

  it('records a copy with where it happened and the signup’s status, and nothing else', async () => {
    const res = await beacon(signupId, 'event=copied&surface=header');
    expect(res.status).toBe(200);
    expect(await rows('signup.link_copied')).toEqual([
      { actorId: organizerId, payload: { surface: 'header', status: 'draft' } },
    ]);
  });

  it('stops counting past 60 copies an hour from one organizer', async () => {
    const otherOrganizer = makeId('org');
    session.actor = { ...owner, id: otherOrganizer };
    try {
      await db.insert(rateLimits).values({
        bucket: 'signup.link_events',
        subject: otherOrganizer,
        windowStart: new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000),
        count: 60,
      });
      expect((await beacon(signupId, 'event=copied&surface=header')).status).toBe(429);
      expect(await rows('signup.link_copied')).toEqual([]);
    } finally {
      await db.delete(rateLimits).where(eq(rateLimits.subject, otherOrganizer));
    }
  });

  it('lets a viewer record a copy: copying the link changes nothing', async () => {
    session.actor = { ...owner, workspaceRoles: { [workspaceId]: 'viewer' } };
    expect((await beacon(signupId, 'event=copied&surface=header')).status).toBe(200);
    expect(await rows('signup.link_copied')).toHaveLength(1);
  });

  it('refuses an organizer from another workspace', async () => {
    const otherWs = makeId('ws');
    session.actor = { ...owner, id: makeId('org'), workspaceIds: [otherWs], workspaceRoles: { [otherWs]: 'owner' } };
    expect((await beacon(signupId, 'event=copied&surface=header')).status).toBe(403);
    expect(await rows('signup.link_copied')).toEqual([]);
  });

  it('refuses a visitor without a session', async () => {
    session.actor = { kind: 'anonymous' };
    expect((await beacon(signupId, 'event=copied&surface=header')).status).toBe(401);
    expect(await rows('signup.link_copied')).toEqual([]);
  });

  it('refuses an event or surface it doesn’t know', async () => {
    expect((await beacon(signupId, 'event=opened&surface=header')).status).toBe(400);
    expect((await beacon(signupId, 'event=shared&surface=header')).status).toBe(400);
    expect((await beacon(signupId, 'event=copied&surface=elsewhere')).status).toBe(400);
    expect((await beacon(signupId, 'event=copied')).status).toBe(400);
    expect(await rows('signup.link_copied')).toEqual([]);
  });

  it('answers 404 for a deleted signup', async () => {
    const created = await createSignup(db, owner, workspaceId, {
      title: 'Gone',
      description: '',
      tags: [],
      visibility: 'unlisted',
      settings: {},
    });
    if (!created.ok) throw new Error(created.error.message);
    await deleteSignup(db, owner, created.value.id);
    expect((await beacon(created.value.id, 'event=copied&surface=header')).status).toBe(404);
    const written = await db
      .select()
      .from(activity)
      .where(
        and(eq(activity.signupId, created.value.id), eq(activity.eventType, 'signup.link_copied')),
      );
    expect(written).toEqual([]);
  });
});
