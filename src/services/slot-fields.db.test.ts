import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import {
  addField,
  deleteField,
  listFields,
  updateField,
} from '@/services/slot-fields';
import { addSlot } from '@/services/slots';
import { createSignup } from '@/services/signups';

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
  const slug = `slot-fields-${workspaceId.slice(-8).toLowerCase()}`;
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

async function teardown(fx: Fixture): Promise<void> {
  await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
  await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
}

async function createTestSignup(fx: Fixture, title = 'Field Test'): Promise<string> {
  const r = await createSignup(fx.db, fx.actor, fx.workspaceId, {
    title,
    description: '',
    tags: [],
    visibility: 'unlisted',
    settings: {},
  });
  if (!r.ok) throw new Error('signup setup failed');
  return r.value.id;
}

describe('slot-fields service (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardown(fx);
  });

  describe('addField', () => {
    it('creates a field and records field.created activity', async () => {
      const sigId = await createTestSignup(fx, 'Add field happy');
      const r = await addField(fx.db, fx.actor, sigId, {
        ref: 'date',
        label: 'Date',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.ref).toBe('date');
      expect(r.value.fieldType).toBe('date');

      const acts = await fx.db.select().from(activity).where(eq(activity.signupId, sigId));
      expect(acts.some((a) => a.eventType === 'field.created')).toBe(true);
    });

    it('rejects duplicate ref within a signup', async () => {
      const sigId = await createTestSignup(fx, 'Dup ref');
      await addField(fx.db, fx.actor, sigId, {
        ref: 'teacher',
        label: 'Teacher',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      const second = await addField(fx.db, fx.actor, sigId, {
        ref: 'teacher',
        label: 'Teacher 2',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.error.code).toBe('conflict');
    });

    it('rejects invalid input via Zod', async () => {
      const sigId = await createTestSignup(fx, 'Bad input');
      const r = await addField(fx.db, fx.actor, sigId, {
        ref: 'NotKebab',
        label: 'X',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');
    });

    it('rejects creation in a signup the actor cannot access', async () => {
      const otherFx = await setupWorkspace();
      try {
        const sigId = await createTestSignup(otherFx, 'Other org');
        await expect(
          addField(fx.db, fx.actor, sigId, {
            ref: 'x',
            label: 'X',
            fieldType: 'text',
            config: { fieldType: 'text' },
          }),
        ).rejects.toThrow(/not a member/);
      } finally {
        await teardown(otherFx);
      }
    });
  });

  describe('updateField', () => {
    it('updates label and records activity', async () => {
      const sigId = await createTestSignup(fx, 'Label update');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'note',
        label: 'Note',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      if (!created.ok) throw new Error('setup failed');
      const r = await updateField(fx.db, fx.actor, created.value.id, { label: 'Updated' });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.label).toBe('Updated');
    });

    it('rejects ref rename (extra key in update payload)', async () => {
      const sigId = await createTestSignup(fx, 'No rename');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'date',
        label: 'Date',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      if (!created.ok) throw new Error('setup failed');
      const r = await updateField(fx.db, fx.actor, created.value.id, {
        ref: 'newref',
      } as unknown as Record<string, unknown>);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');
    });

    it('rejects required-flip when an existing slot has no value', async () => {
      const sigId = await createTestSignup(fx, 'Flip required');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'note',
        label: 'Note',
        fieldType: 'text',
        config: { fieldType: 'text' },
        required: false,
      });
      if (!created.ok) throw new Error('setup failed');
      const slotR = await addSlot(fx.db, fx.actor, sigId, { values: {} });
      if (!slotR.ok) throw new Error('slot setup failed');

      const r = await updateField(fx.db, fx.actor, created.value.id, { required: true });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('conflict');
    });

    it('rejects tightening enum choices that drops an in-use value', async () => {
      const sigId = await createTestSignup(fx, 'Tighten enum');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'subject',
        label: 'Subject',
        fieldType: 'enum',
        config: { fieldType: 'enum', choices: ['Math', 'Science'] },
      });
      if (!created.ok) throw new Error('setup failed');
      const slotR = await addSlot(fx.db, fx.actor, sigId, {
        values: { subject: 'Science' },
      });
      if (!slotR.ok) throw new Error('slot setup failed');

      const r = await updateField(fx.db, fx.actor, created.value.id, {
        fieldType: 'enum',
        config: { fieldType: 'enum', choices: ['Math'] },
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('conflict');
    });
  });

  describe('deleteField', () => {
    it('rejects deleting a field with stored values', async () => {
      const sigId = await createTestSignup(fx, 'Delete blocked');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'teacher',
        label: 'Teacher',
        fieldType: 'text',
        config: { fieldType: 'text' },
      });
      if (!created.ok) throw new Error('setup failed');
      const slotR = await addSlot(fx.db, fx.actor, sigId, {
        values: { teacher: 'Ms. J' },
      });
      if (!slotR.ok) throw new Error('slot setup failed');

      const r = await deleteField(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('conflict');
    });

    it('deletes a field with no stored values', async () => {
      const sigId = await createTestSignup(fx, 'Delete ok');
      const created = await addField(fx.db, fx.actor, sigId, {
        ref: 'unused',
        label: 'Unused',
        fieldType: 'text',
        config: { fieldType: 'text' },
        required: false,
      });
      if (!created.ok) throw new Error('setup failed');
      const r = await deleteField(fx.db, fx.actor, created.value.id);
      expect(r.ok).toBe(true);

      const acts = await fx.db.select().from(activity).where(eq(activity.signupId, sigId));
      expect(acts.some((a) => a.eventType === 'field.deleted')).toBe(true);
    });
  });

  describe('listFields', () => {
    it('returns fields ordered by sortOrder', async () => {
      const sigId = await createTestSignup(fx, 'List ordered');
      await addField(fx.db, fx.actor, sigId, {
        ref: 'b',
        label: 'B',
        fieldType: 'text',
        config: { fieldType: 'text' },
        sortOrder: 5,
      });
      await addField(fx.db, fx.actor, sigId, {
        ref: 'a',
        label: 'A',
        fieldType: 'text',
        config: { fieldType: 'text' },
        sortOrder: 1,
      });
      const r = await listFields(fx.db, fx.actor, sigId);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.map((f) => f.ref)).toEqual(['a', 'b']);
    });
  });

  describe('addSlot integrates with fields', () => {
    it('rejects values that don’t validate against fields', async () => {
      const sigId = await createTestSignup(fx, 'Slot validation');
      await addField(fx.db, fx.actor, sigId, {
        ref: 'date',
        label: 'Date',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      const r = await addSlot(fx.db, fx.actor, sigId, {
        values: { date: 'not-a-date' },
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('invalid_input');
    });

    it('derives slot_at from configured date+time fields', async () => {
      const sigId = await createTestSignup(fx, 'SlotAt deriv');
      await addField(fx.db, fx.actor, sigId, {
        ref: 'date',
        label: 'Date',
        fieldType: 'date',
        config: { fieldType: 'date' },
      });
      await addField(fx.db, fx.actor, sigId, {
        ref: 'time',
        label: 'Time',
        fieldType: 'time',
        config: { fieldType: 'time' },
        required: false,
      });
      const r = await addSlot(fx.db, fx.actor, sigId, {
        values: { date: '2026-05-15', time: '09:30' },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.slotAt?.toISOString()).toBe('2026-05-15T09:30:00.000Z');
    });
  });
});
