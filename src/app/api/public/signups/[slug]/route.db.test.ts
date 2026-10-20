import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { addField } from '@/services/slot-fields';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { GET } from './route';

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
  const slug = `route-pub-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Route Public Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Route Public Workspace',
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

describe('GET /api/public/signups/[slug]', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
    await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  });

  it('sends only the allow-listed keys, at every level', async () => {
    const created = await createSignup(fx.db, fx.actor, fx.workspaceId, {
      title: 'Route Public Keys',
      description: 'Bring a snack',
      tags: ['internal-tag'],
      visibility: 'unlisted' as const,
      settings: { lockoutHoursBeforeSlot: 2, confirmationMessage: 'Organizer note' },
    });
    if (!created.ok) throw new Error(created.error.message);
    const field = await addField(fx.db, fx.actor, created.value.id, {
      ref: 'note',
      label: 'Note',
      fieldType: 'text',
      config: { fieldType: 'text', maxLength: 50 },
    });
    if (!field.ok) throw new Error(field.error.message);
    const slot = await addSlot(fx.db, fx.actor, created.value.id, {
      values: { note: 'Fruit' },
      capacity: 3,
    });
    if (!slot.ok) throw new Error(slot.error.message);
    const pub = await publishSignup(fx.db, fx.actor, created.value.id);
    if (!pub.ok) throw new Error(pub.error.message);
    const commit = await commitToSlot(fx.db, slot.value.id, {
      name: 'Pat Example',
      email: 'pat@example.com',
      quantity: 1,
    });
    if (!commit.ok) throw new Error(commit.error.message);

    const slug = created.value.slug;
    const res = await GET(new NextRequest(`http://localhost/api/public/signups/${slug}`), {
      params: Promise.resolve({ slug }),
    });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: {
        settings: Record<string, unknown>;
        fields: Record<string, unknown>[];
        slots: Record<string, unknown>[];
        committedBySlot: Record<string, number>;
      };
    };

    expect(Object.keys(data).sort()).toEqual(
      [
        'closesAt',
        'committedBySlot',
        'description',
        'fields',
        'opensAt',
        'settings',
        'slots',
        'slug',
        'status',
        'title',
      ].sort(),
    );
    expect(Object.keys(data.settings).sort()).toEqual(
      ['groupByFieldRefs', 'requireEmail', 'sendReminders'].sort(),
    );
    expect(data.fields.length).toBeGreaterThan(0);
    for (const f of data.fields) {
      expect(Object.keys(f).sort()).toEqual(['config', 'fieldType', 'label', 'ref'].sort());
    }
    expect(data.slots.length).toBeGreaterThan(0);
    for (const s of data.slots) {
      expect(Object.keys(s).sort()).toEqual(
        ['capacity', 'committed', 'hasTime', 'id', 'ref', 'slotAt', 'status', 'values'].sort(),
      );
    }
    expect(data.slots.find((s) => s.id === slot.value.id)).toMatchObject({ committed: 1 });
    expect(data.committedBySlot).toEqual({ [slot.value.id]: 1 });
  });

  it('still answers not_found for a slug with no live signup', async () => {
    const slug = 'definitely-not-a-real-slug-xyz';
    const res = await GET(new NextRequest(`http://localhost/api/public/signups/${slug}`), {
      params: Promise.resolve({ slug }),
    });
    expect(res.status).toBe(404);
  });
});
