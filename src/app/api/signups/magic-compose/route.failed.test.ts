import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { err, ok } from '@/lib/result';
import type { Actor } from '@/lib/policy';

// Each failure the route can come back with, and the activity row it leaves.
// The LLM, the session, the rate limit and the database are stubbed: the
// route's own branching is what's under test.

const organizer: Actor = {
  kind: 'organizer',
  id: 'org_test',
  email: 'pat@example.com',
  workspaceIds: ['ws_test'],
  workspaceRoles: { ws_test: 'owner' },
};

const llm = vi.hoisted(() => ({ result: undefined as unknown }));

vi.mock('@/auth/session', () => ({
  requireActor: async () => organizer,
  getOrganizerSession: async () => ({ organizerId: 'org_test', defaultWorkspaceId: 'ws_test' }),
}));
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  magicComposeEnabled: () => true,
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) as unknown }));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  consumeRateLimit: vi.fn(async () => {}),
}));
vi.mock('@/lib/magic-compose/llm-client', () => ({
  defaultLlmClient: () => ({ generateDraft: async () => llm.result }),
}));
vi.mock('@/lib/magic-compose/persist', () => ({
  persistDraft: vi.fn(async () => {
    throw new Error('persistDraft must not run on a failed draft');
  }),
}));
vi.mock('@/lib/activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/activity')>()),
  recordActivityBestEffort: vi.fn(async () => {}),
}));

import { recordActivityBestEffort } from '@/lib/activity';
import { serviceError, ServiceException } from '@/lib/errors';
import { persistDraft } from '@/lib/magic-compose/persist';
import { consumeRateLimit } from '@/lib/rate-limit';
import { POST } from './route';

const goodDraft = {
  title: 'Snack duty',
  fields: [{ ref: 'what', label: 'What', fieldType: 'text' }],
  slots: [{ values: { what: 'Fruit' } }],
};

function compose(prompt = 'Snack duty for six Saturday games', init: { signal?: AbortSignal } = {}) {
  return POST(
    new NextRequest('http://localhost/api/signups/magic-compose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
      ...init,
    }),
  );
}

function recordedCodes() {
  return vi.mocked(recordActivityBestEffort).mock.calls.map(([, row]) => ({
    eventType: row.eventType,
    workspaceId: row.workspaceId,
    actorId: row.actor.actorId,
    payload: row.payload,
  }));
}

describe('POST /api/signups/magic-compose records magic_compose.failed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['timeout', 'upstream', 'invalid_json', 'rate_limited'] as const)(
    'records the LLM client’s %s code',
    async (code) => {
      llm.result = err({ code, message: 'nope' });
      const res = await compose();
      expect(res.ok).toBe(false);
      expect(recordedCodes()).toEqual([
        { eventType: 'magic_compose.failed', workspaceId: 'ws_test', actorId: 'org_test', payload: { code } },
      ]);
    },
  );

  it('records schema_mismatch when the draft has the wrong shape', async () => {
    llm.result = ok({ title: 'x' });
    expect((await compose()).status).toBe(500);
    expect(recordedCodes().map((r) => r.payload)).toEqual([{ code: 'schema_mismatch' }]);
  });

  it('records a refusal without the model’s reason', async () => {
    llm.result = ok({ refusalReason: 'That asks for home addresses.' });
    expect((await compose()).status).toBe(400);
    expect(recordedCodes().map((r) => r.payload)).toEqual([{ code: 'refusal' }]);
  });

  it('records aborted when the organizer left before the draft was saved', async () => {
    llm.result = ok(goodDraft);
    const controller = new AbortController();
    controller.abort();
    expect((await compose(undefined, { signal: controller.signal })).status).toBe(500);
    expect(recordedCodes().map((r) => r.payload)).toEqual([{ code: 'aborted' }]);
  });

  it('records not_saved when the draft couldn’t be saved', async () => {
    llm.result = ok(goodDraft);
    vi.mocked(persistDraft).mockResolvedValueOnce(
      err(serviceError('invalid_input', 'template "magic-compose" has an invalid slot')),
    );
    expect((await compose()).status).toBe(400);
    expect(recordedCodes().map((r) => r.payload)).toEqual([{ code: 'not_saved' }]);
  });

  it('records over_limit when the organizer has used up the hour’s drafts, and still answers 429', async () => {
    vi.mocked(consumeRateLimit).mockRejectedValueOnce(
      new ServiceException(serviceError('rate_limited', 'too many requests')),
    );
    expect((await compose()).status).toBe(429);
    expect(recordedCodes().map((r) => r.payload)).toEqual([{ code: 'over_limit' }]);
  });

  it('records nothing for a prompt it refuses before calling the AI', async () => {
    expect((await compose('')).status).toBe(400);
    expect(recordedCodes()).toEqual([]);
  });
});
