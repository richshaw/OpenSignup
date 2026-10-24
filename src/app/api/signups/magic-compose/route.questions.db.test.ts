import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { rateLimits } from '@/db/schema/rate-limits';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import { getEnv, resetEnvCache } from '@/lib/env';
import { makeId } from '@/lib/ids';
import { MAGIC_COMPOSE_BUCKET } from '@/lib/magic-compose/limits';
import type { ChatMessage } from '@/lib/magic-compose/prompt';
import type { FollowUp } from '@/lib/magic-compose/questions';
import type { Actor } from '@/lib/policy';
import { err, ok } from '@/lib/result';
import { POST } from './route';

// The questions round through the real route: the session and the model are
// stubbed, the quota, the signup and its rows are real.

const session = vi.hoisted(() => ({
  actor: { kind: 'anonymous' } as Actor,
  workspaceId: '',
}));
vi.mock('@/auth/session', () => ({
  requireActor: async () => session.actor,
  getOrganizerSession: async () => ({ defaultWorkspaceId: session.workspaceId }),
}));
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  magicComposeEnabled: () => true,
}));

// Each test queues the model's replies; every call is kept so a test can
// count them and read what the model was sent.
const llm = vi.hoisted(() => ({
  replies: [] as unknown[],
  calls: [] as Array<{ messages: ChatMessage[]; options?: { timeoutMs?: number } }>,
  /** Called on each model call, for a test that moves the clock on. */
  onCall: undefined as (() => void) | undefined,
}));
vi.mock('@/lib/magic-compose/llm-client', () => ({
  defaultLlmClient: () => ({
    async generateDraft(
      messages: ChatMessage[],
      _signal?: AbortSignal,
      options?: { timeoutMs?: number },
    ) {
      llm.calls.push({ messages, ...(options ? { options } : {}) });
      llm.onCall?.();
      return llm.replies.shift() ?? err({ code: 'upstream', message: 'no reply queued' });
    },
  }),
}));

const QUESTIONS = {
  questions: {
    topics: ['what', 'when', 'how_many'],
    whatOptions: ['Bake something to sell', 'Staff the table', 'Set up or clean up'],
  },
};

const DRAFT = {
  title: 'Bake sale',
  description: 'Saturday morning in the school hall.',
  fields: [{ ref: 'job', label: 'Job', fieldType: 'text' }],
  slots: [
    { values: { job: 'Bake something to sell' }, capacity: null },
    { values: { job: 'Staff the table' }, capacity: 2 },
  ],
};

const ANSWERS: FollowUp = {
  what: { picked: ['Bake something to sell', 'Staff the table'], added: [] },
  when: { kind: 'one_day', date: '2026-11-14', from: '09:00', to: '13:00' },
  howMany: [null, 2],
};

const PLACEHOLDERS: FollowUp = {
  what: { picked: [], added: [] },
  when: { kind: 'not_decided' },
  placeholders: true,
};

let organizerId: string;
let workspaceId: string;

beforeEach(async () => {
  llm.replies = [];
  llm.calls = [];
  llm.onCall = undefined;
  const db = getDb();
  organizerId = makeId('org');
  workspaceId = makeId('ws');
  const slug = `mcq-${workspaceId.slice(-8).toLowerCase()}`;
  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({ id: organizerId, email: `${slug}@example.test` });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Magic Compose Questions Test',
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
  session.actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${slug}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  session.workspaceId = workspaceId;
});

afterEach(async () => {
  const db = getDb();
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(organizers).where(eq(organizers.id, organizerId));
  await db
    .delete(rateLimits)
    .where(and(eq(rateLimits.bucket, MAGIC_COMPOSE_BUCKET), eq(rateLimits.subject, organizerId)));
});

function compose(body: unknown, init: { signal?: AbortSignal } = {}) {
  return POST(
    new NextRequest('http://localhost/api/signups/magic-compose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...init,
    }),
  );
}

/** How many of this hour's drafts the organizer has used. */
async function quotaUsed(): Promise<number> {
  const rows = await getDb()
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.bucket, MAGIC_COMPOSE_BUCKET), eq(rateLimits.subject, organizerId)));
  return rows.reduce((sum, r) => sum + r.count, 0);
}

async function signupsMade(): Promise<number> {
  const rows = await getDb()
    .select({ id: signups.id })
    .from(signups)
    .where(eq(signups.workspaceId, workspaceId));
  return rows.length;
}

/** The user message of the model's nth call. */
function sent(n: number): string {
  return llm.calls[n]?.messages.find((m) => m.role === 'user')?.content ?? '';
}

describe('POST /api/signups/magic-compose: questions and follow-ups (db)', () => {
  it('answers a name-only prompt with the questions, and makes no signup', async () => {
    llm.replies = [ok(QUESTIONS)];
    const res = await compose({ prompt: 'Bake sale' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: QUESTIONS });
    expect(await signupsMade()).toBe(0);
    expect(llm.calls).toHaveLength(1);
    expect(await quotaUsed()).toBe(1);
  });

  it('drafts from a follow-up, sending the model the description and the answers', async () => {
    llm.replies = [ok(DRAFT)];
    const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; summary: { slotsAdded: number } } };
    expect(body.data.summary.slotsAdded).toBe(2);
    expect(await signupsMade()).toBe(1);
    expect(llm.calls).toHaveLength(1);
    expect(sent(0)).toMatch(/^Bake sale\n\nAnswers to your questions:\n/);
    expect(sent(0)).toContain('- When: 2026-11-14, 09:00 to 13:00');
    expect(await quotaUsed()).toBe(1);
  });

  it('retries once when the answers get questions back, then says it couldn’t draft', async () => {
    llm.replies = [ok(QUESTIONS), ok(QUESTIONS)];
    const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'invalid_input',
        message:
          "Couldn't draft from these answers. Add a little more, or draft with placeholders.",
        details: { reason: 'asked_again' },
      },
    });
    expect(llm.calls).toHaveLength(2);
    expect(sent(1)).toMatch(/questions can't be answered here\. Use a TBD: placeholder/);
    // The retry gets what's left of the one budget, never a fresh one.
    expect(llm.calls[0]?.options).toBeUndefined();
    const retryMs = llm.calls[1]?.options?.timeoutMs ?? 0;
    expect(retryMs).toBeGreaterThan(15_000);
    expect(retryMs).toBeLessThanOrEqual(getEnv().LLM_TIMEOUT_MS);
    expect(await quotaUsed()).toBe(1);
    expect(await signupsMade()).toBe(0);
  });

  it.each([
    ['about less than the first time', { questions: { topics: ['when'], whatOptions: [] } }],
    ['beside half a draft', { ...DRAFT, questions: QUESTIONS.questions }],
  ])('retries when the answers get questions back %s', async (_name, again) => {
    llm.replies = [ok(again), ok(DRAFT)];
    const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
    expect(res.status).toBe(200);
    expect(llm.calls).toHaveLength(2);
    expect(await signupsMade()).toBe(1);
  });

  it('drafts in one call when the draft carries a null questions key', async () => {
    llm.replies = [ok({ ...DRAFT, questions: null })];
    const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
    expect(res.status).toBe(200);
    expect(llm.calls).toHaveLength(1);
    expect(await signupsMade()).toBe(1);
  });

  it('says it couldn’t draft when the retry asks again in another shape', async () => {
    llm.replies = [ok(QUESTIONS), ok({ questions: { topics: ['when'] } })];
    const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
    const body = (await res.json()) as { error: { details: unknown } };
    expect(body.error.details).toEqual({ reason: 'asked_again' });
    expect(llm.calls).toHaveLength(2);
  });

  it('reports a retry that runs out of time as a timeout', async () => {
    llm.replies = [ok(QUESTIONS), err({ code: 'timeout', message: 'LLM request timed out' })];
    const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe('AI drafting timed out. Try a simpler prompt.');
    expect(llm.calls).toHaveLength(2);
    expect(await quotaUsed()).toBe(1);
  });

  it('after Draft with placeholders, says to try again or fill it in by hand', async () => {
    llm.replies = [ok(QUESTIONS), ok(QUESTIONS)];
    const res = await compose({ prompt: 'Bake sale', followUp: PLACEHOLDERS });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string; details: unknown } };
    expect(body.error.message).toBe("Couldn't draft this. Try again, or fill it in by hand.");
    expect(body.error.details).toEqual({ reason: 'asked_again' });
  });

  it('drafts when the retry comes back with a draft', async () => {
    llm.replies = [ok(QUESTIONS), ok(DRAFT)];
    const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
    expect(res.status).toBe(200);
    expect(await signupsMade()).toBe(1);
    expect(llm.calls).toHaveLength(2);
    expect(await quotaUsed()).toBe(1);
  });

  it('reports a refusal after the answers as a refusal', async () => {
    llm.replies = [ok({ refusalReason: 'That collects home addresses.' })];
    const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string; details: unknown } };
    expect(body.error.message).toBe('That collects home addresses.');
    expect(body.error.details).toEqual({ reason: 'refusal' });
    expect(await signupsMade()).toBe(0);
  });

  it('skips the retry when the organizer has already left', async () => {
    llm.replies = [ok(QUESTIONS), ok(DRAFT)];
    const controller = new AbortController();
    controller.abort();
    const res = await compose(
      { prompt: 'Bake sale', followUp: ANSWERS },
      { signal: controller.signal },
    );
    const body = (await res.json()) as { error: { details: unknown } };
    expect(body.error.details).toEqual({ reason: 'asked_again' });
    expect(llm.calls).toHaveLength(1);
  });

  describe('when the first call used most of the budget', () => {
    // The clock moves on by `took` during the first model call.
    let took = 0;
    beforeEach(() => {
      const start = Date.now();
      let elapsed = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => start + elapsed);
      llm.onCall = () => {
        if (llm.calls.length === 1) elapsed += took;
      };
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('skips the retry with under 15 seconds left, and says it couldn’t draft', async () => {
      took = getEnv().LLM_TIMEOUT_MS - 14_000;
      llm.replies = [ok(QUESTIONS), ok(DRAFT)];
      const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { details: unknown } };
      expect(body.error.details).toEqual({ reason: 'asked_again' });
      expect(llm.calls).toHaveLength(1);
      expect(await signupsMade()).toBe(0);
    });

    it('still retries with 16 seconds left', async () => {
      took = getEnv().LLM_TIMEOUT_MS - 16_000;
      llm.replies = [ok(QUESTIONS), ok(DRAFT)];
      const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
      expect(res.status).toBe(200);
      expect(llm.calls[1]?.options?.timeoutMs).toBe(16_000);
    });

    describe('with a short LLM_TIMEOUT_MS', () => {
      const original = process.env.LLM_TIMEOUT_MS;
      beforeEach(() => {
        process.env.LLM_TIMEOUT_MS = '10000';
        resetEnvCache();
      });
      afterEach(() => {
        if (original === undefined) delete process.env.LLM_TIMEOUT_MS;
        else process.env.LLM_TIMEOUT_MS = original;
        resetEnvCache();
      });

      it('retries with half the budget left, rather than never', async () => {
        took = 4_000;
        llm.replies = [ok(QUESTIONS), ok(DRAFT)];
        const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
        expect(res.status).toBe(200);
        expect(llm.calls[1]?.options?.timeoutMs).toBe(6_000);
      });

      it('skips it with less than half left', async () => {
        took = 6_000;
        llm.replies = [ok(QUESTIONS), ok(DRAFT)];
        const res = await compose({ prompt: 'Bake sale', followUp: ANSWERS });
        const body = (await res.json()) as { error: { details: unknown } };
        expect(body.error.details).toEqual({ reason: 'asked_again' });
        expect(llm.calls).toHaveLength(1);
      });
    });
  });

  it.each([
    [
      'a date that is not a real day',
      { when: { kind: 'one_day', date: '2026-02-30' } },
      /real day/,
    ],
    [
      'times out of order',
      { when: { kind: 'one_day', date: '2026-11-14', from: '13:00', to: '09:00' } },
      /end time must be after the start time/,
    ],
    ['a count that is not a whole number', { howMany: [null, 1.5] }, /whole numbers/],
  ])('rejects answers with %s before the quota or the model', async (_name, change, message) => {
    const res = await compose({ prompt: 'Bake sale', followUp: { ...ANSWERS, ...change } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; field: string; message: string } };
    expect(body.error.code).toBe('invalid_input');
    expect(body.error.field).toBe('followUp');
    expect(body.error.message).toMatch(message);
    expect(llm.calls).toHaveLength(0);
    expect(await quotaUsed()).toBe(0);
  });
});
