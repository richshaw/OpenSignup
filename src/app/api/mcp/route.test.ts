import { describe, expect, it, vi } from 'vitest';

const resolve = vi.fn();
vi.mock('@/auth/bearer', () => ({ resolveBearerActor: (...a: unknown[]) => resolve(...a) }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) as unknown }));
const consume = vi.fn(async () => {});
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, consumeRateLimit: (...args: unknown[]) => consume(...(args as [])) };
});

const okResolution = {
  ok: true,
  actor: {
    kind: 'organizer',
    id: 'org_1',
    email: 'a@example.com',
    workspaceIds: ['ws_1'],
    workspaceRoles: { ws_1: 'owner' },
    via: { clientId: 'c' },
  },
  scopes: ['signups:read', 'signups:write'],
  clientId: 'c',
  defaultWorkspaceId: 'ws_1',
  workspaces: [{ id: 'ws_1', slug: 'w', name: 'W', role: 'owner' }],
};

const HEADERS = {
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json',
  authorization: 'Bearer tok',
};

function rpc(method: string, params: unknown = {}, id: number | undefined = 1) {
  return JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params });
}

/** The legacy stateless leg may answer with SSE; pull the JSON-RPC response out of either. */
async function readRpc(res: Response): Promise<unknown> {
  const text = await res.text();
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    const line = text.split('\n').find((l) => l.startsWith('data:'));
    return line ? JSON.parse(line.slice(5)) : undefined;
  }
  return text ? JSON.parse(text) : undefined;
}

describe('/api/mcp', () => {
  it('meters by IP before touching the token, and passes the seam challenge through', async () => {
    const { POST } = await import('./route');
    const challenge = new Response(null, {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
    });
    resolve.mockResolvedValueOnce({ ok: false, response: challenge });
    const r = await POST(
      new Request('https://x.test/api/mcp', {
        method: 'POST',
        headers: { ...HEADERS, 'x-forwarded-for': '203.0.113.9' },
        body: rpc('initialize'),
      }),
    );
    expect(r).toBe(challenge);
    const [, policy, subject] = consume.mock.calls.at(-1) as unknown as [unknown, { bucket: string }, string];
    expect(policy.bucket).toBe('mcp.ip');
    expect(subject).toBe('203.0.113.9');
  });

  it('asks the seam for the tool scope on tools/call and for none on initialize', async () => {
    const { POST } = await import('./route');
    resolve.mockResolvedValue(okResolution);
    await POST(
      new Request('https://x.test/api/mcp', {
        method: 'POST',
        headers: HEADERS,
        body: rpc('tools/call', { name: 'list_signups', arguments: {} }),
      }),
    );
    expect(resolve.mock.calls.at(-1)?.[1]).toEqual({ requiredScopes: ['signups:read'] });
    await POST(
      new Request('https://x.test/api/mcp', {
        method: 'POST',
        headers: HEADERS,
        body: rpc('initialize', {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 't', version: '0' },
        }),
      }),
    );
    expect(resolve.mock.calls.at(-1)?.[1]).toEqual({});
  });

  it('serves a tools/list through the SDK with the organizer context attached', async () => {
    const { POST } = await import('./route');
    resolve.mockResolvedValue(okResolution);
    const r = await POST(new Request('https://x.test/api/mcp', { method: 'POST', headers: HEADERS, body: rpc('tools/list') }));
    expect(r.status).toBe(200);
    const body = (await readRpc(r)) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((t) => t.name)).toContain('list_workspaces');
  });

  it('answers GET with 405 after the token check, since there are no sessions', async () => {
    const { GET } = await import('./route');
    resolve.mockResolvedValue(okResolution);
    const r = await GET(new Request('https://x.test/api/mcp', { headers: HEADERS }));
    expect(r.status).toBe(405);
  });

  it('rejects a body over the size cap with 413 before reading it', async () => {
    const { POST } = await import('./route');
    resolve.mockResolvedValue(okResolution);
    const r = await POST(
      new Request('https://x.test/api/mcp', {
        method: 'POST',
        headers: { ...HEADERS, 'content-length': '2000000' },
        body: 'x',
      }),
    );
    expect(r.status).toBe(413);
  });

  it('hands a non-JSON body to the SDK unread so it answers with its own 400', async () => {
    const { POST } = await import('./route');
    resolve.mockResolvedValue(okResolution);
    const r = await POST(new Request('https://x.test/api/mcp', { method: 'POST', headers: HEADERS, body: '{not json' }));
    expect(r.status).toBe(400);
    const body = (await readRpc(r)) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it('answers 429 with Retry-After when the bucket is exhausted', async () => {
    const { POST } = await import('./route');
    const { ServiceException, serviceError } = await import('@/lib/errors');
    consume.mockImplementationOnce(async () => {
      throw new ServiceException(serviceError('rate_limited', 'x', { details: { retryAfterSeconds: 12 } }));
    });
    const r = await POST(new Request('https://x.test/api/mcp', { method: 'POST', headers: HEADERS, body: rpc('tools/list') }));
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('12');
  });
});
