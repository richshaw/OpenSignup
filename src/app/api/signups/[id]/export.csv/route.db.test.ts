import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot, removeCommitment } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { GET } from './route';

// The route reads the organizer from the session cookie. The test hands it one
// directly instead of going through Auth.js.
const session = vi.hoisted(() => ({ actor: { kind: 'anonymous' } as Actor }));
vi.mock('@/auth/session', () => ({ requireActor: async () => session.actor }));

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  signupId: string;
  slug: string;
}

/**
 * A published signup with a date field and a text field, one slot, Pat signed
 * up to it, and Sam signed up and then taken off by the organizer.
 */
async function setupFixture(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const wsSlug = `csv-${workspaceId.slice(-8).toLowerCase()}`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email: `${wsSlug}@example.test` });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug: wsSlug,
      name: 'Export CSV Route Test',
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
    email: `${wsSlug}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  session.actor = actor;

  const created = await createSignup(
    db,
    actor,
    workspaceId,
    { title: 'Snack duty' },
    {
      template: {
        id: 'export-csv-test',
        fields: [
          {
            ref: 'day',
            label: 'Day',
            fieldType: 'date',
            sortOrder: 0,
            config: { fieldType: 'date' },
          },
          {
            ref: 'what',
            label: 'What',
            fieldType: 'text',
            sortOrder: 1,
            config: { fieldType: 'text', maxLength: 200 },
          },
        ],
        slots: [],
      },
    },
  );
  if (!created.ok) throw new Error(created.error.message);
  const signupId = created.value.id;
  const slot = await addSlot(db, actor, signupId, {
    values: { day: '2030-11-14', what: 'Fruit and water' },
    capacity: 5,
  });
  if (!slot.ok) throw new Error(slot.error.message);
  const pub = await publishSignup(db, actor, signupId);
  if (!pub.ok) throw new Error(pub.error.message);

  const pat = await commitToSlot(db, slot.value.id, {
    name: 'Pat Example',
    email: `pat-${wsSlug}@example.test`,
    quantity: 1,
  });
  if (!pat.ok) throw new Error(pat.error.message);
  const sam = await commitToSlot(db, slot.value.id, {
    name: 'Sam Example',
    email: `sam-${wsSlug}@example.test`,
    quantity: 2,
    notes: 'Bringing cups',
  });
  if (!sam.ok) throw new Error(sam.error.message);
  const removed = await removeCommitment(db, actor, sam.value.commitment.id);
  if (!removed.ok) throw new Error(removed.error.message);

  return { db, workspaceId, organizerId, signupId, slug: created.value.slug };
}

describe('GET /api/signups/[id]/export.csv (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupFixture();
  });

  afterAll(async () => {
    if (!fx) return; // setup failed: let its own error show
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it('writes a column per field and says who the organizer removed', async () => {
    const req = new NextRequest(`http://localhost/api/signups/${fx.signupId}/export.csv`);
    const res = await GET(req, { params: Promise.resolve({ id: fx.signupId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="${fx.slug}-responses.csv"`,
    );

    const [header, pat, sam, ...rest] = (await res.text()).replace(/^﻿/, '').split('\n');
    expect(header).toBe('Day,What,Name,Email,Status,Spots,Notes,Signed up');
    const wsSlug = `csv-${fx.workspaceId.slice(-8).toLowerCase()}`;
    expect(pat).toMatch(
      new RegExp(
        `^2030-11-14,Fruit and water,Pat Example,pat-${wsSlug}@example\\.test,confirmed,1,,\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z$`,
      ),
    );
    expect(sam).toMatch(
      new RegExp(
        `^2030-11-14,Fruit and water,Sam Example,sam-${wsSlug}@example\\.test,removed,2,Bringing cups,`,
      ),
    );
    expect(rest).toEqual([]);
  });
});
