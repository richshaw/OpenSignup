// Integration test for the Magic Compose chain that the POST route exercises:
// stub LlmClient -> Zod-validate -> magicComposeToTemplate -> createSignup.
// We don't invoke POST() directly because that calls next-auth `auth()`; the
// flow under test is everything after auth, which is the load-bearing path.

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
import type { Actor } from '@/lib/policy';
import { ok } from '@/lib/result';
import {
  buildMessages,
  MagicComposeDraftSchema,
  type ChatMessage,
} from '@/lib/magic-compose/prompt';
import type { LlmClient } from '@/lib/magic-compose/llm-client';
import { magicComposeToTemplate } from '@/lib/magic-compose/to-template';
import { listFieldsForSignup } from '@/services/slot-fields';
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
  const slug = `mc-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email, name: 'Test Org' });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Magic Compose Test',
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

  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  return { db, workspaceId, organizerId, actor };
}

async function teardown(db: Db, workspaceId: string, organizerId: string) {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(organizers).where(eq(organizers.id, organizerId));
}

const CANNED_DRAFT = {
  title: 'U9 snack duty, Spring',
  description: 'Two families per game. No nuts please.',
  fields: [
    { ref: 'date', label: 'Date', fieldType: 'date', required: true },
    { ref: 'opponent', label: 'Opponent', fieldType: 'text' },
  ],
  slots: [
    { values: { date: '2026-04-25', opponent: 'Hawks' }, capacity: 2 },
    { values: { date: '2026-05-02', opponent: 'Foxes' }, capacity: 2 },
    { values: { date: '2026-05-09', opponent: 'Bears' }, capacity: 2 },
  ],
};

function stubLlmClient(raw: unknown): LlmClient {
  return {
    async generateDraft(_messages: ChatMessage[]) {
      return ok(raw);
    },
  };
}

describe('magic-compose route chain (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    await teardown(fx.db, fx.workspaceId, fx.organizerId);
  });

  it('writes signup, slot fields, slots, and signup.created activity in one transaction', async () => {
    const client = stubLlmClient(CANNED_DRAFT);
    const userPrompt = 'snack duty for U9 soccer, six saturdays';

    const llm = await client.generateDraft(buildMessages(userPrompt));
    expect(llm.ok).toBe(true);
    if (!llm.ok) return;
    const draft = MagicComposeDraftSchema.parse(llm.value);
    const template = magicComposeToTemplate(draft);
    expect(template.id).toBe('magic-compose');
    expect(template.fields).toHaveLength(2);
    expect(template.slots).toHaveLength(3);

    const r = await createSignup(
      fx.db,
      fx.actor,
      fx.workspaceId,
      {
        title: draft.title,
        description: draft.description,
        visibility: 'unlisted',
      },
      { template },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.status).toBe('draft');
    expect(r.value.workspaceId).toBe(fx.workspaceId);

    const fields = await listFieldsForSignup(fx.db, r.value.id);
    expect(fields.map((f) => f.ref).sort()).toEqual(['date', 'opponent']);

    const slotRows = await fx.db.select().from(slots).where(eq(slots.signupId, r.value.id));
    expect(slotRows).toHaveLength(3);
    expect(slotRows.every((s) => s.capacity === 2)).toBe(true);

    const acts = await fx.db.select().from(activity).where(eq(activity.signupId, r.value.id));
    const created = acts.find((a) => a.eventType === 'signup.created');
    expect(created).toBeDefined();
    expect((created?.payload as { templateId?: string } | null)?.templateId).toBe(
      'magic-compose',
    );
    expect((created?.payload as { fieldsAdded?: number } | null)?.fieldsAdded).toBe(2);
    expect((created?.payload as { slotsAdded?: number } | null)?.slotsAdded).toBe(3);

    const persisted = await fx.db.select().from(signups).where(eq(signups.id, r.value.id));
    expect(persisted).toHaveLength(1);
  });

  it('rejects a draft whose values reference unknown field refs (converter strips them)', async () => {
    const client = stubLlmClient({
      ...CANNED_DRAFT,
      slots: [{ values: { date: '2026-04-25', stray: 'nope' }, capacity: 1 }],
    });
    const llm = await client.generateDraft([]);
    if (!llm.ok) throw new Error('stub should not error');
    const draft = MagicComposeDraftSchema.parse(llm.value);
    const template = magicComposeToTemplate(draft);
    expect(template.slots[0]?.values).toEqual({ date: '2026-04-25' });

    const r = await createSignup(
      fx.db,
      fx.actor,
      fx.workspaceId,
      { title: draft.title, description: '', visibility: 'unlisted' },
      { template },
    );
    expect(r.ok).toBe(true);
  });

  it('rejects a draft with an out-of-enum fieldType at the Zod boundary', () => {
    const r = MagicComposeDraftSchema.safeParse({
      ...CANNED_DRAFT,
      fields: [{ ref: 'essay', label: 'Essay', fieldType: 'essay' }],
    });
    expect(r.success).toBe(false);
  });
});
