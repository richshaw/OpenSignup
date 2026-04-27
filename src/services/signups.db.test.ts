import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor, WorkspaceRole } from '@/lib/policy';
import { addSlot } from '@/services/slots';
import {
  archiveSignup,
  closeSignup,
  createSignup,
  getPublicSignup,
  getSignupForOrganizer,
  listSignupsForWorkspace,
  publishSignup,
  updateSignup,
} from '@/services/signups';

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  actor: Actor;
}

async function setupWorkspace(role: WorkspaceRole = 'owner'): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const memberId = makeId('mem');
  const slug = `test-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Test Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Test Workspace',
      type: 'personal',
      plan: 'free',
    });
    await tx.insert(workspaceMembers).values({
      id: memberId,
      workspaceId,
      organizerId,
      role,
      status: 'active',
    });
  });

  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: role },
  };

  return { db, workspaceId, organizerId, actor };
}

async function teardownWorkspace(db: Db, workspaceId: string, organizerId: string): Promise<void> {
  // Cascade order: activity & members & signups (and slots via signups) cascade from workspace delete.
  // Then remove the organizer (signups had ON DELETE RESTRICT for organizer_id, but they're gone now).
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(organizers).where(eq(organizers.id, organizerId));
}

const validCreateInput = (title = 'Team potluck') => ({
  title,
  description: 'Bring something tasty',
  tags: ['food'],
  visibility: 'unlisted' as const,
  settings: {},
});

describe('signups service (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardownWorkspace(fx.db, fx.workspaceId, fx.organizerId);
  });

  describe('createSignup', () => {
    it('creates a draft with a slug and an activity row', async () => {
      const r = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Bake sale'));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.status).toBe('draft');
      expect(r.value.slug.length).toBeGreaterThan(0);
      expect(r.value.workspaceId).toBe(fx.workspaceId);
      expect(r.value.organizerId).toBe(fx.organizerId);

      const acts = await fx.db
        .select()
        .from(activity)
        .where(eq(activity.signupId, r.value.id));
      expect(acts.some((a) => a.eventType === 'signup.created')).toBe(true);
    });

    it('rejects invalid input via Zod', async () => {
      const r = await createSignup(fx.db, fx.actor, fx.workspaceId, { title: 'x' });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');
    });

    it('rejects an actor not in the workspace', async () => {
      const stranger: Actor = {
        kind: 'organizer',
        id: makeId('org'),
        email: 'stranger@example.test',
        workspaceIds: [],
        workspaceRoles: {},
      };
      await expect(
        createSignup(fx.db, stranger, fx.workspaceId, validCreateInput('No way')),
      ).rejects.toThrow(/not a member/);
    });

    it('rejects a viewer in the workspace', async () => {
      const viewerFx = await setupWorkspace('viewer');
      try {
        await expect(
          createSignup(viewerFx.db, viewerFx.actor, viewerFx.workspaceId, validCreateInput('Viewer attempt')),
        ).rejects.toThrow(/cannot modify/);
      } finally {
        await teardownWorkspace(viewerFx.db, viewerFx.workspaceId, viewerFx.organizerId);
      }
    });
  });

  describe('getSignupForOrganizer', () => {
    it('returns the signup with its slots for an authorized actor', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Reading'));
      if (!created.ok) throw new Error('setup failed');

      const r = await getSignupForOrganizer(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.id).toBe(created.value.id);
      expect(Array.isArray(r.value.slots)).toBe(true);
    });

    it('returns not_found for a missing id', async () => {
      const r = await getSignupForOrganizer(fx.db, fx.actor, makeId('sig'));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('not_found');
    });

    it('rejects access from a different workspace', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Private'));
      if (!created.ok) throw new Error('setup failed');

      const otherFx = await setupWorkspace();
      try {
        await expect(
          getSignupForOrganizer(otherFx.db, otherFx.actor, created.value.id),
        ).rejects.toThrow(/not a member/);
      } finally {
        await teardownWorkspace(otherFx.db, otherFx.workspaceId, otherFx.organizerId);
      }
    });
  });

  describe('listSignupsForWorkspace', () => {
    it('returns workspace signups newest-first and supports status filter', async () => {
      const listFx = await setupWorkspace();
      try {
        const a = await createSignup(listFx.db, listFx.actor, listFx.workspaceId, validCreateInput('Alpha'));
        const b = await createSignup(listFx.db, listFx.actor, listFx.workspaceId, validCreateInput('Beta'));
        if (!a.ok || !b.ok) throw new Error('setup failed');

        const all = await listSignupsForWorkspace(listFx.db, listFx.actor, listFx.workspaceId);
        expect(all.ok).toBe(true);
        if (!all.ok) return;
        const ids = all.value.map((r) => r.id);
        expect(ids).toContain(a.value.id);
        expect(ids).toContain(b.value.id);
        // Newer (b) is created last; createdAt is server-generated and may share a millisecond,
        // but `desc(createdAt)` should at least keep b on or before a.
        const bIdx = ids.indexOf(b.value.id);
        const aIdx = ids.indexOf(a.value.id);
        expect(bIdx).toBeLessThanOrEqual(aIdx);

        const drafts = await listSignupsForWorkspace(listFx.db, listFx.actor, listFx.workspaceId, {
          status: 'draft',
        });
        expect(drafts.ok).toBe(true);
        if (!drafts.ok) return;
        expect(drafts.value.every((r) => r.status === 'draft')).toBe(true);

        const open = await listSignupsForWorkspace(listFx.db, listFx.actor, listFx.workspaceId, {
          status: 'open',
        });
        expect(open.ok).toBe(true);
        if (!open.ok) return;
        expect(open.value.length).toBe(0);
      } finally {
        await teardownWorkspace(listFx.db, listFx.workspaceId, listFx.organizerId);
      }
    });
  });

  describe('updateSignup', () => {
    it('updates fields and records signup.updated', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Before'));
      if (!created.ok) throw new Error('setup failed');

      const r = await updateSignup(fx.db, fx.actor, created.value.id, {
        title: 'After',
        description: 'New description',
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.title).toBe('After');
      expect(r.value.description).toBe('New description');

      const acts = await fx.db
        .select()
        .from(activity)
        .where(eq(activity.signupId, created.value.id));
      expect(acts.some((a) => a.eventType === 'signup.updated')).toBe(true);
    });

    it('returns not_found for a missing signup', async () => {
      const r = await updateSignup(fx.db, fx.actor, makeId('sig'), { title: 'No' });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('not_found');
    });
  });

  describe('status transitions', () => {
    async function withSlot(signupId: string): Promise<void> {
      const r = await addSlot(fx.db, fx.actor, signupId, {
        values: {},
        capacity: 1,
      });
      if (!r.ok) throw new Error(`slot setup failed: ${r.error.message}`);
    }

    it('publishSignup moves draft → open and stamps opensAt', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Pub'));
      if (!created.ok) throw new Error('setup failed');
      await withSlot(created.value.id);

      const r = await publishSignup(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.status).toBe('open');
      expect(r.value.opensAt).toBeInstanceOf(Date);
    });

    it('publishSignup rejects when no slots', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Empty'));
      if (!created.ok) throw new Error('setup failed');

      const r = await publishSignup(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('conflict');
      expect(r.error.message).toMatch(/at least one slot/);
    });

    it('publishSignup rejects when not in draft', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Twice'));
      if (!created.ok) throw new Error('setup failed');
      await withSlot(created.value.id);
      const first = await publishSignup(fx.db, fx.actor, created.value.id);
      if (!first.ok) throw new Error('setup failed');

      const r = await publishSignup(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('conflict');
      expect(r.error.received).toBe('open');
      expect(r.error.expected).toBe('draft');
    });

    it('closeSignup moves open → closed', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Close me'));
      if (!created.ok) throw new Error('setup failed');
      await withSlot(created.value.id);
      const pub = await publishSignup(fx.db, fx.actor, created.value.id);
      if (!pub.ok) throw new Error('setup failed');

      const r = await closeSignup(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.status).toBe('closed');
    });

    it('closeSignup rejects from draft', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Still draft'));
      if (!created.ok) throw new Error('setup failed');

      const r = await closeSignup(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('conflict');
      expect(r.error.received).toBe('draft');
    });

    it('archiveSignup moves any status → archived (no `from` constraint)', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Archive me'));
      if (!created.ok) throw new Error('setup failed');

      const r = await archiveSignup(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.status).toBe('archived');
    });
  });

  describe('getPublicSignup', () => {
    it('returns ok for an open signup', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Public open'));
      if (!created.ok) throw new Error('setup failed');
      const slotR = await addSlot(fx.db, fx.actor, created.value.id, {
        values: {},
        capacity: 1,
      });
      if (!slotR.ok) throw new Error('setup failed');
      const pub = await publishSignup(fx.db, fx.actor, created.value.id);
      if (!pub.ok) throw new Error('setup failed');

      const r = await getPublicSignup(fx.db, pub.value.slug);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.id).toBe(created.value.id);
      expect(r.value.committerByslot).toEqual({});
    });

    it('returns ok for a closed signup', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Public closed'));
      if (!created.ok) throw new Error('setup failed');
      await addSlot(fx.db, fx.actor, created.value.id, {
        values: {},
        capacity: 1,
      });
      const pub = await publishSignup(fx.db, fx.actor, created.value.id);
      if (!pub.ok) throw new Error('setup failed');
      const closed = await closeSignup(fx.db, fx.actor, created.value.id);
      if (!closed.ok) throw new Error('setup failed');

      const r = await getPublicSignup(fx.db, pub.value.slug);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.status).toBe('closed');
    });

    it('returns not_found with received=draft for a draft signup', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Still hidden'));
      if (!created.ok) throw new Error('setup failed');

      const r = await getPublicSignup(fx.db, created.value.slug);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('not_found');
      expect(r.error.received).toBe('draft');
      expect(r.error.message).toMatch(/not yet published/);
    });

    it('returns not_found with received=archived for an archived signup', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Gone'));
      if (!created.ok) throw new Error('setup failed');
      const arch = await archiveSignup(fx.db, fx.actor, created.value.id);
      if (!arch.ok) throw new Error('setup failed');

      const r = await getPublicSignup(fx.db, created.value.slug);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('not_found');
      expect(r.error.received).toBe('archived');
      expect(r.error.message).toMatch(/no longer available/);
    });

    it('returns not_found without `received` for an unknown slug', async () => {
      const r = await getPublicSignup(fx.db, 'definitely-not-a-real-slug-xyz');
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('not_found');
      expect(r.error.received).toBeUndefined();
    });

    it('returns not_found without `received` when soft-deleted', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Deleted'));
      if (!created.ok) throw new Error('setup failed');
      await fx.db
        .update(signups)
        .set({ deletedAt: new Date() })
        .where(eq(signups.id, created.value.id));

      const r = await getPublicSignup(fx.db, created.value.slug);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('not_found');
      expect(r.error.received).toBeUndefined();
    });
  });
});

