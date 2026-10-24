import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
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
  FullDraftSchema,
  MagicComposeDraftSchema,
  type ChatMessage,
} from '@/lib/magic-compose/prompt';
import type { LlmClient } from '@/lib/magic-compose/llm-client';
import { magicComposeToTemplate } from '@/lib/magic-compose/to-template';
import { listFieldsForSignup } from '@/services/slot-fields';
import { createSignup } from '@/services/signups';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '@/schemas/signups';
import { POST } from './route';

// For the tests that drive POST itself: the session and the model are
// stubbed, everything from the draft's parse to the database is real.
const route = vi.hoisted(() => ({ actor: undefined as unknown, workspaceId: '', llmResult: undefined as unknown }));
vi.mock('@/auth/session', () => ({
  requireActor: async () => route.actor,
  getOrganizerSession: async () => ({ defaultWorkspaceId: route.workspaceId }),
}));
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  magicComposeEnabled: () => true,
}));
vi.mock('@/lib/magic-compose/llm-client', () => ({
  defaultLlmClient: () => ({ generateDraft: async () => route.llmResult }),
}));

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
    { ref: 'date', label: 'Date', fieldType: 'date' },
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
    const draft = FullDraftSchema.parse(llm.value);
    const { template } = magicComposeToTemplate(draft);
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
    const draft = FullDraftSchema.parse(llm.value);
    const { template } = magicComposeToTemplate(draft);
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

describe('POST /api/signups/magic-compose with an over-long title or description (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
    route.actor = fx.actor;
    route.workspaceId = fx.workspaceId;
  });

  afterAll(async () => {
    await teardown(fx.db, fx.workspaceId, fx.organizerId);
  });

  async function compose(draft: unknown) {
    route.llmResult = ok(draft);
    const res = await POST(
      new NextRequest('http://localhost/api/signups/magic-compose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'Keep our announcement word for word' }),
      }),
    );
    const body = (await res.json()) as { data: { id: string; warnings: string[] } };
    return { status: res.status, ...body.data };
  }

  async function savedSignup(id: string) {
    const [row] = await fx.db.select().from(signups).where(eq(signups.id, id));
    return row!;
  }

  it('makes the signup with the description cut to its limit, and warns', async () => {
    const description = 'Please bring a dish to share with everyone. '.repeat(48);
    expect(description.length).toBeGreaterThan(2100);
    const r = await compose({ ...CANNED_DRAFT, description });
    expect(r.status).toBe(200);
    const row = await savedSignup(r.id);
    expect(row.description!.length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
    expect(row.description!.endsWith('…')).toBe(true);
    expect(r.warnings).toContain(
      "The AI's description was longer than 2,000 characters, so the end was cut off. Check it below.",
    );
    const slotRows = await fx.db.select().from(slots).where(eq(slots.signupId, r.id));
    expect(slotRows).toHaveLength(3);
  });

  it('makes the signup with the title cut to its limit, and warns', async () => {
    const title = 'U9 snack duty for the spring season of Saturday games '.repeat(3);
    expect(title.length).toBeGreaterThan(TITLE_MAX_LENGTH);
    const r = await compose({ ...CANNED_DRAFT, title });
    expect(r.status).toBe(200);
    const row = await savedSignup(r.id);
    expect(row.title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
    expect(row.title.endsWith('…')).toBe(true);
    expect(r.warnings).toContain(
      "The AI's title was longer than 120 characters, so the end was cut off. Check it below.",
    );
  });

  it('adds no warning to a draft within the limits', async () => {
    const r = await compose(CANNED_DRAFT);
    expect(r.status).toBe(200);
    expect(r.warnings).toEqual([]);
    expect((await savedSignup(r.id)).description).toBe(CANNED_DRAFT.description);
  });
});
