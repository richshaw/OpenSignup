import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { OTHER_LANGUAGE, OTHER_LOCALE } from '@/i18n/testing/locales';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { ok } from '@/lib/result';
import {
  buildMessages,
  FullDraftSchema,
  MagicComposeDraftSchema,
  type ChatMessage,
} from '@/lib/magic-compose/prompt';
import type { DraftWarning } from '@/lib/magic-compose/draft-warnings';
import type { LlmClient } from '@/lib/magic-compose/llm-client';
import { magicComposeToTemplate } from '@/lib/magic-compose/to-template';
import { listFieldsForSignup } from '@/services/slot-fields';
import { createSignup } from '@/services/signups';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '@/schemas/signups';
import { POST } from './route';

// For the tests that drive POST itself: the session and the model are
// stubbed, everything from the draft's parse to the database is real.
const route = vi.hoisted(() => ({
  actor: undefined as unknown,
  workspaceId: '',
  llmResult: undefined as unknown,
  locale: null as string | null,
  instanceDefault: undefined as string | undefined,
  /** The system prompt of the model's last call. */
  system: '',
}));
vi.mock('@/auth/session', () => ({
  requireActor: async () => route.actor,
  getOrganizerSession: async () => ({
    defaultWorkspaceId: route.workspaceId,
    locale: route.locale,
  }),
}));
// The instance's DEFAULT_LOCALE as each test sets it: getEnv() parses the
// environment once.
vi.mock('@/i18n/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/server')>()),
  instanceDefaultLocale: () => route.instanceDefault,
}));
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  magicComposeEnabled: () => true,
}));
vi.mock('@/lib/magic-compose/llm-client', () => ({
  defaultLlmClient: () => ({
    async generateDraft(messages: { role: string; content: string }[]) {
      route.system = messages.find((m) => m.role === 'system')?.content ?? '';
      return route.llmResult;
    },
  }),
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

    const llm = await client.generateDraft(buildMessages(userPrompt, { fallbackLocale: 'en' }));
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
    expect((created?.payload as { templateId?: string } | null)?.templateId).toBe('magic-compose');
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
    const body = (await res.json()) as {
      data: { id: string; warnings: string[]; codedWarnings: DraftWarning[] };
    };
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
    // Beside it, the same as a code with its arguments, for the screen to word.
    expect(r.codedWarnings).toEqual([
      { code: 'text_cut', field: 'description', max: DESCRIPTION_MAX_LENGTH },
    ]);
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
    expect(r.codedWarnings).toEqual([{ code: 'text_cut', field: 'title', max: TITLE_MAX_LENGTH }]);
  });

  it('gives what the conversion changed in English and as codes, in the same order', async () => {
    const title = 'U9 snack duty for the spring season of Saturday games '.repeat(3);
    const r = await compose({
      ...CANNED_DRAFT,
      title,
      fields: [...CANNED_DRAFT.fields, { ref: 'role', label: 'Role', fieldType: 'enum' }],
      slots: [
        { values: { date: 'next Saturday', opponent: 'Hawks', stray: 'x' }, capacity: 2 },
        ...CANNED_DRAFT.slots.slice(1),
      ],
    });
    expect(r.status).toBe(200);
    expect(r.codedWarnings).toEqual([
      { code: 'text_cut', field: 'title', max: TITLE_MAX_LENGTH },
      { code: 'values_blanked', count: 1 },
      { code: 'enum_fields_to_text', fields: ['role'] },
      { code: 'stray_values', count: 1 },
    ]);
    expect(r.warnings).toEqual([
      "The AI's title was longer than 120 characters, so the end was cut off. Check it below.",
      "1 value was left blank because it didn't fit its field. Fill it in below.",
      'Field role arrived without a fixed list of options, so it was switched to free text.',
      "Ignored 1 stray value that didn't match any field.",
    ]);
  });

  it('adds no warning to a draft within the limits', async () => {
    const r = await compose(CANNED_DRAFT);
    expect(r.status).toBe(200);
    expect(r.warnings).toEqual([]);
    expect(r.codedWarnings).toEqual([]);
    expect((await savedSignup(r.id)).description).toBe(CANNED_DRAFT.description);
  });
});

describe('POST /api/signups/magic-compose starts the signup in the organizer’s language, and drafts in it when the description can’t tell (db)', () => {
  let fx: Fixture;
  // Two shifts a day, grouped by day, so the grouping is kept.
  const GROUPED = {
    title: 'Bake sale stall',
    description: '',
    fields: [
      { ref: 'date', label: 'Date', fieldType: 'date' },
      { ref: 'shift', label: 'Shift', fieldType: 'text' },
    ],
    slots: [
      { values: { date: '2026-04-25', shift: 'Morning' }, capacity: 2 },
      { values: { date: '2026-04-25', shift: 'Afternoon' }, capacity: 2 },
    ],
    groupBy: 'date',
  };

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  beforeEach(() => {
    route.actor = fx.actor;
    route.workspaceId = fx.workspaceId;
    route.locale = null;
    route.instanceDefault = undefined;
    route.system = '';
  });

  afterAll(async () => {
    await teardown(fx.db, fx.workspaceId, fx.organizerId);
  });

  /** The prompt's fallback, as the model reads it, naming the language in English. */
  const writesIn = (name: string) =>
    `If the prompt is too short or too mixed to tell (a few names and dates), write in ${name}.`;

  async function compose(acceptLanguage?: string) {
    route.llmResult = ok(GROUPED);
    const res = await POST(
      new NextRequest('http://localhost/api/signups/magic-compose', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(acceptLanguage ? { 'accept-language': acceptLanguage } : {}),
        },
        body: JSON.stringify({ prompt: 'Snack duty for three Saturdays' }),
      }),
    );
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { id: string } };
    const [row] = await fx.db.select().from(signups).where(eq(signups.id, data.id));
    const [created] = await fx.db
      .select({ payload: activity.payload })
      .from(activity)
      .where(and(eq(activity.signupId, data.id), eq(activity.eventType, 'signup.created')));
    return {
      settings: row!.settings as Record<string, unknown>,
      telemetry: created?.payload as Record<string, unknown>,
      system: route.system,
    };
  }

  it('stores no language, and records none, while only English has shipped', async () => {
    shipOnlyEnglish();
    route.locale = 'en';
    route.instanceDefault = 'en';
    const { settings, telemetry, system } = await compose('en');
    expect(system).toContain(writesIn('English'));
    expect(settings).toMatchObject({ groupByFieldRefs: ['date'] });
    expect(settings).not.toHaveProperty('locale');
    expect(telemetry).toMatchObject({ templateId: 'magic-compose' });
    expect(telemetry).not.toHaveProperty('locale');
    expect(telemetry).not.toHaveProperty('localeSource');
  });

  it('tells the model English while only English has shipped, whatever the organizer stored or their browser asks for', async () => {
    shipOnlyEnglish();
    route.locale = OTHER_LOCALE;
    const { system } = await compose(OTHER_LOCALE);
    expect(system).toContain(writesIn('English'));
  });

  describe(`once ${OTHER_LANGUAGE} has shipped to participants`, () => {
    beforeEach(() => {
      ship('participant', ['en', OTHER_LOCALE]);
    });

    it.each([
      { step: 'setting', locale: OTHER_LOCALE, instanceDefault: 'en' },
      { step: 'instance', locale: null, instanceDefault: OTHER_LOCALE },
    ])(
      `starts it in ${OTHER_LANGUAGE} chosen by the organizer’s $step, keeping the grouping, whatever the browser asks for`,
      async ({ step, ...given }) => {
        Object.assign(route, given);
        const { settings, telemetry, system } = await compose('en');
        expect(system).toContain(writesIn(OTHER_LANGUAGE));
        expect(settings).toMatchObject({ groupByFieldRefs: ['date'], locale: OTHER_LOCALE });
        expect(telemetry).toMatchObject({
          templateId: 'magic-compose',
          locale: OTHER_LOCALE,
          localeSource: step,
        });
      },
    );

    it('starts it in English when no step names a shipped language, taking none from the browser', async () => {
      route.locale = 'xx';
      for (const browser of [OTHER_LOCALE, 'de']) {
        const { settings, telemetry, system } = await compose(browser);
        expect(system).toContain(writesIn('English'));
        expect(settings).toMatchObject({ groupByFieldRefs: ['date'], locale: 'en' });
        expect(telemetry).toMatchObject({ locale: 'en', localeSource: 'default' });
      }
    });
  });
});
