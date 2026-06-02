import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor, WorkspaceRole } from '@/lib/policy';
import { DEFAULT_TEMPLATE, EMPTY_TEMPLATE, type SignupTemplate } from '@/lib/signup-templates';
import { listFieldsForSignup } from '@/services/slot-fields';
import { addSlot } from '@/services/slots';
import { commitToSlot } from '@/services/commitments';
import {
  archiveSignup,
  closeSignup,
  createSignup,
  deleteSignup,
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

    it('applies DEFAULT_TEMPLATE when no opts.template is supplied', async () => {
      const r = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Default tmpl'));
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      const fields = await listFieldsForSignup(fx.db, r.value.id);
      expect(fields).toHaveLength(1);
      expect(fields[0]!.ref).toBe('date');
      expect(fields[0]!.fieldType).toBe('date');

      const slotRows = await fx.db
        .select()
        .from(slots)
        .where(eq(slots.signupId, r.value.id));
      expect(slotRows).toHaveLength(1);
      expect(slotRows[0]!.capacity).toBe(1);
      expect(slotRows[0]!.values).toEqual({});
      expect(slotRows[0]!.status).toBe('open');

      const acts = await fx.db.select().from(activity).where(eq(activity.signupId, r.value.id));
      const created = acts.find((a) => a.eventType === 'signup.created');
      expect(created).toBeDefined();
      const payload = created!.payload as Record<string, unknown>;
      expect(payload.templateId).toBe(DEFAULT_TEMPLATE.id);
      expect(payload.fieldsAdded).toBe(1);
      expect(payload.slotsAdded).toBe(1);
      expect('title' in payload).toBe(false);
    });

    it('applies a custom template when supplied', async () => {
      const custom: SignupTemplate = {
        id: 'date-and-item',
        fields: [
          {
            ref: 'date',
            label: 'Date',
            fieldType: 'date',
            sortOrder: 0,
            config: { fieldType: 'date' },
          },
          {
            ref: 'item',
            label: 'Item',
            fieldType: 'text',
            sortOrder: 1,
            config: { fieldType: 'text', maxLength: 200 },
          },
        ],
        slots: [
          { capacity: 2, values: {}, sortOrder: 0 },
          { capacity: 5, values: {}, sortOrder: 1 },
        ],
      };

      const r = await createSignup(
        fx.db,
        fx.actor,
        fx.workspaceId,
        validCreateInput('Custom tmpl'),
        { template: custom },
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      const fields = await listFieldsForSignup(fx.db, r.value.id);
      expect(fields.map((f) => f.ref)).toEqual(['date', 'item']);

      const slotRows = await fx.db
        .select()
        .from(slots)
        .where(eq(slots.signupId, r.value.id));
      expect(slotRows).toHaveLength(2);
      const capacities = slotRows.map((s) => s.capacity).sort();
      expect(capacities).toEqual([2, 5]);
    });

    it('rejects a template with duplicate field refs (no DB writes)', async () => {
      const broken: SignupTemplate = {
        id: 'broken',
        fields: [
          {
            ref: 'date',
            label: 'Date',
            fieldType: 'date',
            sortOrder: 0,
            config: { fieldType: 'date' },
          },
          {
            ref: 'date',
            label: 'Date again',
            fieldType: 'date',
            sortOrder: 1,
            config: { fieldType: 'date' },
          },
        ],
        slots: [{ capacity: 1, values: {}, sortOrder: 0 }],
      };

      const before = await fx.db
        .select({ id: signups.id })
        .from(signups)
        .where(eq(signups.workspaceId, fx.workspaceId));
      const beforeCount = before.length;

      const r = await createSignup(
        fx.db,
        fx.actor,
        fx.workspaceId,
        validCreateInput('Dup ref'),
        { template: broken },
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');
      expect(r.error.message).toMatch(/duplicate field ref/);

      const after = await fx.db
        .select({ id: signups.id })
        .from(signups)
        .where(eq(signups.workspaceId, fx.workspaceId));
      expect(after.length).toBe(beforeCount);
    });

    it('rejects a template whose slot capacity is not a positive integer', async () => {
      const bad: SignupTemplate = {
        id: 'zero-cap',
        fields: [],
        slots: [{ capacity: 0, values: {}, sortOrder: 0 }],
      };
      const r = await createSignup(
        fx.db,
        fx.actor,
        fx.workspaceId,
        validCreateInput('Zero cap'),
        { template: bad },
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');
      expect(r.error.message).toMatch(/invalid slot/);
    });

    it('rejects a template whose slot values reference an unknown field', async () => {
      const bad: SignupTemplate = {
        id: 'unknown-ref',
        fields: [
          {
            ref: 'date',
            label: 'Date',
            fieldType: 'date',
            sortOrder: 0,
            config: { fieldType: 'date' },
          },
        ],
        slots: [{ capacity: 1, values: { nope: 'x' }, sortOrder: 0 }],
      };
      const r = await createSignup(
        fx.db,
        fx.actor,
        fx.workspaceId,
        validCreateInput('Unknown ref'),
        { template: bad },
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');
      expect(r.error.message).toMatch(/unknown field ref/);
    });

    it('computes slotAt for template slots when reminderFromFieldRef is set and values include a date', async () => {
      const tmpl: SignupTemplate = {
        id: 'date-with-values',
        fields: [
          {
            ref: 'date',
            label: 'Date',
            fieldType: 'date',
            sortOrder: 0,
            config: { fieldType: 'date' },
          },
        ],
        slots: [{ capacity: 1, values: { date: '2027-01-15' }, sortOrder: 0 }],
      };
      const r = await createSignup(
        fx.db,
        fx.actor,
        fx.workspaceId,
        { ...validCreateInput('Slot at'), settings: { reminderFromFieldRef: 'date' } },
        { template: tmpl },
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      const slotRows = await fx.db
        .select()
        .from(slots)
        .where(eq(slots.signupId, r.value.id));
      expect(slotRows).toHaveLength(1);
      expect(slotRows[0]!.slotAt).toEqual(new Date('2027-01-15T00:00:00.000Z'));
    });

    it('rejects a template with an invalid field shape (no DB writes)', async () => {
      const before = await fx.db
        .select({ id: signups.id })
        .from(signups)
        .where(eq(signups.workspaceId, fx.workspaceId));
      const beforeCount = before.length;

      const bad: SignupTemplate = {
        id: 'bad',
        fields: [
          {
            ref: 'NotKebab',
            label: 'X',
            fieldType: 'text',
            sortOrder: 0,
            config: { fieldType: 'text', maxLength: 200 },
          },
        ],
        slots: [],
      };

      const r = await createSignup(
        fx.db,
        fx.actor,
        fx.workspaceId,
        validCreateInput('Bad template'),
        { template: bad },
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');

      const after = await fx.db
        .select({ id: signups.id })
        .from(signups)
        .where(eq(signups.workspaceId, fx.workspaceId));
      expect(after.length).toBe(beforeCount);
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

    it('clears reminderFromFieldRef when omitted from settings update', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Reminder'));
      if (!created.ok) throw new Error('setup failed');

      const set = await updateSignup(fx.db, fx.actor, created.value.id, {
        settings: { reminderFromFieldRef: 'date' },
      });
      expect(set.ok).toBe(true);

      const cleared = await updateSignup(fx.db, fx.actor, created.value.id, {
        settings: {},
      });
      expect(cleared.ok).toBe(true);
      if (!cleared.ok) return;
      const s = cleared.value.settings as { reminderFromFieldRef?: string };
      expect(s.reminderFromFieldRef).toBeUndefined();
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
      const created = await createSignup(
        fx.db,
        fx.actor,
        fx.workspaceId,
        validCreateInput('Empty'),
        { template: EMPTY_TEMPLATE },
      );
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
      expect(r.value.committedBySlot).toEqual({});
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

    it('rejects a single commit whose quantity exceeds capacity', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Cap qty'));
      if (!created.ok) throw new Error('setup failed');
      const slotR = await addSlot(fx.db, fx.actor, created.value.id, { values: {}, capacity: 1 });
      if (!slotR.ok) throw new Error('slot setup failed');
      const pub = await publishSignup(fx.db, fx.actor, created.value.id);
      if (!pub.ok) throw new Error('setup failed');

      const r = await commitToSlot(fx.db, slotR.value.id, {
        name: 'Sarah',
        email: 'sarah@example.com',
        quantity: 5,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('capacity_full');

      const acts = await fx.db
        .select()
        .from(activity)
        .where(eq(activity.signupId, created.value.id));
      const failures = acts.filter((a) => a.eventType === 'commitment.attempt_failed');
      expect(failures).toHaveLength(1);
      expect((failures[0]!.payload as Record<string, unknown>).reason).toBe('capacity_full');
      expect((failures[0]!.payload as Record<string, unknown>).slotId).toBe(slotR.value.id);

      const pubR = await getPublicSignup(fx.db, created.value.slug);
      if (!pubR.ok) throw new Error('public read failed');
      expect(pubR.value.committedBySlot).toEqual({});
    });

    it('logs commitment.attempt_failed with reason=closed when committing to a closed signup', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Closed for commit'));
      if (!created.ok) throw new Error('setup failed');
      const slotR = await addSlot(fx.db, fx.actor, created.value.id, { values: {}, capacity: 5 });
      if (!slotR.ok) throw new Error('slot setup failed');
      const pub = await publishSignup(fx.db, fx.actor, created.value.id);
      if (!pub.ok) throw new Error('setup failed');
      const closed = await closeSignup(fx.db, fx.actor, created.value.id);
      if (!closed.ok) throw new Error('setup failed');

      const r = await commitToSlot(fx.db, slotR.value.id, {
        name: 'Late',
        email: 'late@example.com',
        quantity: 1,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('closed');

      const acts = await fx.db
        .select()
        .from(activity)
        .where(eq(activity.signupId, created.value.id));
      const failures = acts.filter((a) => a.eventType === 'commitment.attempt_failed');
      expect(failures).toHaveLength(1);
      expect((failures[0]!.payload as Record<string, unknown>).reason).toBe('closed');
    });

    it('reports committedBySlot as sum of quantities', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Qty sum'));
      if (!created.ok) throw new Error('setup failed');
      const slotR = await addSlot(fx.db, fx.actor, created.value.id, { values: {}, capacity: 10 });
      if (!slotR.ok) throw new Error('slot setup failed');
      const pub = await publishSignup(fx.db, fx.actor, created.value.id);
      if (!pub.ok) throw new Error('setup failed');

      const a = await commitToSlot(fx.db, slotR.value.id, {
        name: 'A',
        email: 'a@example.com',
        quantity: 3,
      });
      if (!a.ok) throw new Error('first commit failed');
      const b = await commitToSlot(fx.db, slotR.value.id, {
        name: 'B',
        email: 'b@example.com',
        quantity: 4,
      });
      if (!b.ok) throw new Error('second commit failed');

      const pubR = await getPublicSignup(fx.db, created.value.slug);
      if (!pubR.ok) throw new Error('public read failed');
      expect(pubR.value.committedBySlot[slotR.value.id]).toBe(7);

      const c = await commitToSlot(fx.db, slotR.value.id, {
        name: 'C',
        email: 'c@example.com',
        quantity: 4,
      });
      expect(c.ok).toBe(false);
      if (c.ok) return;
      expect(c.error.code).toBe('capacity_full');
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

  describe('deleteSignup', () => {
    it('soft-deletes the signup: sets deletedAt and records signup.deleted with the prior status in payload', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('To delete'));
      if (!created.ok) throw new Error('setup failed');
      expect(created.value.status).toBe('draft');

      const r = await deleteSignup(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.deletedAt).toBeInstanceOf(Date);
      // status is preserved so a human can recover by clearing deletedAt
      expect(r.value.status).toBe('draft');

      const acts = await fx.db
        .select()
        .from(activity)
        .where(eq(activity.signupId, created.value.id));
      const deletedEvents = acts.filter((a) => a.eventType === 'signup.deleted');
      expect(deletedEvents).toHaveLength(1);
      expect((deletedEvents[0]!.payload as Record<string, unknown>).status).toBe('draft');
    });

    it('returns not_found for a missing id', async () => {
      const r = await deleteSignup(fx.db, fx.actor, makeId('sig'));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('not_found');
    });

    it('rejects a foreign-workspace actor before the idempotency branch', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Locked'));
      if (!created.ok) throw new Error('setup failed');
      // Soft-delete first so we know the policy check still fires when the row is already deleted
      const first = await deleteSignup(fx.db, fx.actor, created.value.id);
      if (!first.ok) throw new Error('setup failed');

      const otherFx = await setupWorkspace();
      try {
        await expect(
          deleteSignup(otherFx.db, otherFx.actor, created.value.id),
        ).rejects.toThrow(/not a member/);
      } finally {
        await teardownWorkspace(otherFx.db, otherFx.workspaceId, otherFx.organizerId);
      }
    });

    it('rejects a viewer in the workspace (write guard fires)', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Viewer no-delete'));
      if (!created.ok) throw new Error('setup failed');
      // Synthesize a viewer-role actor scoped to the same workspace.
      // requireWorkspaceWrite reads actor.workspaceRoles, so no DB member row is needed.
      const viewer: Actor = {
        kind: 'organizer',
        id: makeId('org'),
        email: 'viewer@example.test',
        workspaceIds: [fx.workspaceId],
        workspaceRoles: { [fx.workspaceId]: 'viewer' },
      };

      await expect(deleteSignup(fx.db, viewer, created.value.id)).rejects.toThrow(/cannot modify/);
    });

    it('is idempotent: second call returns ok and only one signup.deleted activity is written', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Twice gone'));
      if (!created.ok) throw new Error('setup failed');

      const first = await deleteSignup(fx.db, fx.actor, created.value.id);
      expect(first.ok).toBe(true);
      const second = await deleteSignup(fx.db, fx.actor, created.value.id);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      // The deletedAt timestamp should be the one written by the first call
      expect(second.value.deletedAt?.getTime()).toBe(first.value.deletedAt?.getTime());

      const acts = await fx.db
        .select()
        .from(activity)
        .where(eq(activity.signupId, created.value.id));
      const deletedEvents = acts.filter((a) => a.eventType === 'signup.deleted');
      expect(deletedEvents).toHaveLength(1);
    });

    it('is concurrency-safe: parallel deletes write a single signup.deleted activity', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Race delete'));
      if (!created.ok) throw new Error('setup failed');

      const [a, b] = await Promise.all([
        deleteSignup(fx.db, fx.actor, created.value.id),
        deleteSignup(fx.db, fx.actor, created.value.id),
      ]);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);

      const acts = await fx.db
        .select()
        .from(activity)
        .where(eq(activity.signupId, created.value.id));
      const deletedEvents = acts.filter((ev) => ev.eventType === 'signup.deleted');
      expect(deletedEvents).toHaveLength(1);
    });

    it('causes getSignupForOrganizer to return not_found (read-path guard)', async () => {
      const created = await createSignup(fx.db, fx.actor, fx.workspaceId, validCreateInput('Hidden after delete'));
      if (!created.ok) throw new Error('setup failed');

      const before = await getSignupForOrganizer(fx.db, fx.actor, created.value.id);
      expect(before.ok).toBe(true);

      const del = await deleteSignup(fx.db, fx.actor, created.value.id);
      if (!del.ok) throw new Error('delete failed');

      const after = await getSignupForOrganizer(fx.db, fx.actor, created.value.id);
      expect(after.ok).toBe(false);
      if (after.ok) return;
      expect(after.error.code).toBe('not_found');
    });

    it('excludes deleted signups from listSignupsForWorkspace', async () => {
      const listFx = await setupWorkspace();
      try {
        const keep = await createSignup(listFx.db, listFx.actor, listFx.workspaceId, validCreateInput('Keep'));
        const gone = await createSignup(listFx.db, listFx.actor, listFx.workspaceId, validCreateInput('Gone'));
        if (!keep.ok || !gone.ok) throw new Error('setup failed');

        const del = await deleteSignup(listFx.db, listFx.actor, gone.value.id);
        if (!del.ok) throw new Error('delete failed');

        const all = await listSignupsForWorkspace(listFx.db, listFx.actor, listFx.workspaceId);
        expect(all.ok).toBe(true);
        if (!all.ok) return;
        const ids = all.value.map((r) => r.id);
        expect(ids).toContain(keep.value.id);
        expect(ids).not.toContain(gone.value.id);
      } finally {
        await teardownWorkspace(listFx.db, listFx.workspaceId, listFx.organizerId);
      }
    });
  });
});

