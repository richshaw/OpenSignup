import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultLlmClient, resolveChatCompletionsUrl } from './llm-client';
import { resetEnvCache } from '@/lib/env';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  resetEnvCache();
  process.env = {
    ...ORIGINAL_ENV,
    DATABASE_URL: 'postgres://x',
    AUTH_SECRET: 'x'.repeat(32),
    AUTH_URL: 'http://localhost:3000',
    EMAIL_FROM: 'test@example.com',
    LLM_BASE_URL: 'https://llm.test/v1',
    LLM_MODEL: 'test-model',
    LLM_API_KEY: 'sk-test',
  };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  resetEnvCache();
  vi.restoreAllMocks();
});

function mockFetch(impl: typeof fetch) {
  vi.stubGlobal('fetch', impl);
}

const goodBody = {
  choices: [
    {
      message: {
        content: JSON.stringify({ title: 'X', fields: [], slots: [] }),
      },
    },
  ],
};

describe('resolveChatCompletionsUrl', () => {
  it('appends /chat/completions to a bare base URL', () => {
    expect(resolveChatCompletionsUrl('https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    );
  });
  it('strips a trailing slash before appending', () => {
    expect(resolveChatCompletionsUrl('https://openrouter.ai/api/v1/')).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    );
  });
  it('returns full URLs unchanged', () => {
    expect(
      resolveChatCompletionsUrl('https://openrouter.ai/api/v1/chat/completions'),
    ).toBe('https://openrouter.ai/api/v1/chat/completions');
  });
  it('handles full URL with trailing slash', () => {
    expect(
      resolveChatCompletionsUrl('https://openrouter.ai/api/v1/chat/completions/'),
    ).toBe('https://openrouter.ai/api/v1/chat/completions');
  });
});

describe('defaultLlmClient.generateDraft', () => {
  it('returns parsed JSON on a successful response', async () => {
    mockFetch(async () => new Response(JSON.stringify(goodBody), { status: 200 }));
    const client = defaultLlmClient();
    const r = await client.generateDraft([{ role: 'user', content: 'hi' }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ title: 'X', fields: [], slots: [] });
  });

  it('maps HTTP 429 to rate_limited', async () => {
    mockFetch(async () => new Response('over', { status: 429 }));
    const r = await defaultLlmClient().generateDraft([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('rate_limited');
  });

  it('maps HTTP 500 to upstream', async () => {
    mockFetch(async () => new Response('boom', { status: 500 }));
    const r = await defaultLlmClient().generateDraft([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('upstream');
  });

  it('flags invalid envelope JSON', async () => {
    mockFetch(async () => new Response('not json', { status: 200 }));
    const r = await defaultLlmClient().generateDraft([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_json');
  });

  it('flags missing choices[0].message.content', async () => {
    mockFetch(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    const r = await defaultLlmClient().generateDraft([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('schema_mismatch');
  });

  it('flags invalid inner JSON content', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'oops' } }] }), {
        status: 200,
      }),
    );
    const r = await defaultLlmClient().generateDraft([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_json');
  });

  it('refuses when env is not configured', async () => {
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    resetEnvCache();
    const r = await defaultLlmClient().generateDraft([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_configured');
  });

  it('forwards the abort signal to the upstream fetch', async () => {
    const captured: { signal?: AbortSignal } = {};
    mockFetch(async (_url, init) => {
      captured.signal = init?.signal as AbortSignal | undefined;
      return new Response(JSON.stringify(goodBody), { status: 200 });
    });
    const ac = new AbortController();
    await defaultLlmClient().generateDraft([], ac.signal);
    expect(captured.signal).toBeDefined();
  });

  it('returns aborted when the caller signal is aborted', async () => {
    mockFetch(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    const ac = new AbortController();
    ac.abort();
    const r = await defaultLlmClient().generateDraft([], ac.signal);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('aborted');
  });
});
