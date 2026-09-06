import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { participants } from '@/db/schema/participants';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { reminderOptOutTokenFor } from '@/services/reminder-optout';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { GET, POST } from './route';

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  actor: Actor;
}

// A distinct source IP per request so the per-IP limiter never throttles an
// unrelated assertion.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 254 || 1}`;
}

async function setupWorkspace(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `route-opt-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Route Optout Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Route Optout Workspace',
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

async function makeParticipant(fx: Fixture, title: string) {
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

  const [row] = await fx.db
    .select({ participantId: commitments.participantId })
    .from(commitments)
    .where(eq(commitments.id, commit.value.commitment.id))
    .limit(1);
  if (!row) throw new Error('commitment not found');

  return {
    participantId: row.participantId,
    token: reminderOptOutTokenFor(row.participantId),
    signupSlug: created.value.slug,
  };
}

function postRequest(body: Record<string, string>, accept: string): Request {
  return new Request('http://localhost/api/public/reminder-optout', {
    method: 'POST',
    headers: { 'x-forwarded-for': nextIp(), accept },
    body: new URLSearchParams(body),
  });
}

async function optedOutAt(db: Db, participantId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: participants.remindersOptedOutAt })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  return row?.at ?? null;
}

describe('POST /api/public/reminder-optout', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    // Workspace first: deleting it cascades signups → slots → commitments,
    // which is what still references the organizer row.
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it('redirects a confirm-page submission to the page, opted out', async () => {
    const p = await makeParticipant(fx, 'Route Browser Optout');
    const res = await POST(
      postRequest(
        { p: p.participantId, token: p.token, slug: p.signupSlug },
        'text/html,application/xhtml+xml',
      ),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('done=off');
    expect(res.headers.get('location')).toContain(`/s/${p.signupSlug}/unsubscribe`);
    expect(await optedOutAt(fx.db, p.participantId)).not.toBeNull();
  });

  /**
   * The regression this file exists for.
   *
   * The browser/machine split used to read `Accept`, so any submission of the
   * confirm page that did not carry a document-navigation Accept — a
   * fetch-based submit, a client that normalises the header — silently took
   * the one-click path: the opt-out applied, and the person was left on the
   * old page with a bare 200 and no confirmation it had worked.
   */
  it('redirects a confirm-page submission even when Accept says nothing about html', async () => {
    const p = await makeParticipant(fx, 'Route Fetch Optout');
    const res = await POST(
      postRequest({ p: p.participantId, token: p.token, slug: p.signupSlug }, '*/*'),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('done=off');
    expect(await optedOutAt(fx.db, p.participantId)).not.toBeNull();
  });

  it('answers a one-click POST with a bare 200 and no redirect', async () => {
    const p = await makeParticipant(fx, 'Route OneClick Optout');
    // RFC 8058 §3.1: the body a provider sends, with no slug of ours in it.
    const res = await POST(
      postRequest({ p: p.participantId, token: p.token, 'List-Unsubscribe': 'One-Click' }, '*/*'),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(await optedOutAt(fx.db, p.participantId)).not.toBeNull();
  });

  it('leaves the row alone when the link is merely opened', async () => {
    const p = await makeParticipant(fx, 'Route Get Optout');
    const res = await GET(
      new Request(
        `http://localhost/api/public/reminder-optout?p=${p.participantId}&token=${encodeURIComponent(p.token)}`,
        { headers: { 'x-forwarded-for': nextIp() } },
      ),
    );

    expect(res.status).toBe(302);
    expect(await optedOutAt(fx.db, p.participantId)).toBeNull();
  });
});
