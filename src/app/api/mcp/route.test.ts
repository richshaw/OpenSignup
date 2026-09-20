import { describe, expect, it, vi } from 'vitest';
import { readRpc } from '@/mcp/testing/rpc';

const resolve = vi.fn();
vi.mock('@/auth/bearer', () => ({ resolveBearerActor: (...a: unknown[]) => resolve(...a) }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) as unknown }));
const consume = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, consumeRateLimit: (...args: unknown[]) => consume(...args) };
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
  authInfo: { token: 'tok', clientId: 'c', scopes: ['signups:read', 'signups:write'] },
};

const HEADERS = {
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json',
  authorization: 'Bearer tok',
};

function rpc(method: string, params: unknown = {}, id: number | undefined = 1) {
  return JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params });
}

function post(body: string | ReadableStream, headers: Record<string, string> = HEADERS) {
  return new Request('https://x.test/api/mcp', {
    method: 'POST',
    headers,
    body,
    ...(typeof body === 'string' ? {} : { duplex: 'half' }),
  } as RequestInit);
}

const buckets = () => consume.mock.calls.map((c) => (c[1] as { bucket: string }).bucket);

describe('/api/mcp', () => {
  it('meters by IP before touching the token, and passes the seam challenge through', async () => {
    const { POST } = await import('./route');
    consume.mockClear();
    const challenge = new Response(null, {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
    });
    resolve.mockResolvedValueOnce({ ok: false, response: challenge });
    const r = await POST(post(rpc('initialize'), { ...HEADERS, 'x-forwarded-for': '203.0.113.9' }));
    expect(r).toBe(challenge);
    expect(buckets()).toEqual(['mcp.ip']);
    expect(consume.mock.calls[0]?.[2]).toBe('203.0.113.9');
  });

  it('meters the organizer once the token has resolved', async () => {
    const { POST } = await import('./route');
    consume.mockClear();
    resolve.mockResolvedValue(okResolution);
    await POST(post(rpc('tools/list')));
    expect(buckets()).toEqual(['mcp.ip', 'mcp.organizer']);
    expect(consume.mock.calls[1]?.[2]).toBe('org_1');
  });

  it('charges the organizer one unit per tool call in a batch, not one per request', async () => {
    const { POST } = await import('./route');
    consume.mockClear();
    resolve.mockResolvedValue(okResolution);
    const batch = `[${[
      rpc('tools/call', { name: 'list_signups', arguments: {} }, 1),
      rpc('tools/call', { name: 'list_workspaces', arguments: {} }, 2),
      rpc('tools/call', { name: 'get_signup', arguments: { signupId: 'sig_1' } }, 3),
    ].join(',')}]`;
    await POST(post(batch));
    expect(buckets()).toEqual(['mcp.ip', 'mcp.organizer']);
    // Per IP the request still costs one; per organizer it costs the work it does.
    expect(consume.mock.calls[0]?.[3]).toBe(1);
    expect(consume.mock.calls[1]?.[3]).toBe(3);
  });

  it('charges one unit for a request that calls no tools', async () => {
    const { POST } = await import('./route');
    consume.mockClear();
    resolve.mockResolvedValue(okResolution);
    await POST(post(rpc('tools/list')));
    expect(consume.mock.calls[1]?.[3]).toBe(1);
  });

  it('asks the seam for the tool scope on tools/call and for none on initialize', async () => {
    const { POST } = await import('./route');
    resolve.mockResolvedValue(okResolution);
    await POST(post(rpc('tools/call', { name: 'list_signups', arguments: {} })));
    expect(resolve.mock.calls.at(-1)?.[1]).toEqual({ requiredScopes: ['signups:read'] });
    await POST(
      post(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } })),
    );
    expect(resolve.mock.calls.at(-1)?.[1]).toEqual({ requiredScopes: [] });
  });

  it('serves a tools/list through the SDK with the organizer context attached', async () => {
    const { POST } = await import('./route');
    resolve.mockResolvedValue(okResolution);
    const r = await POST(post(rpc('tools/list')));
    expect(r.status).toBe(200);
    const body = (await readRpc(r)) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((t) => t.name)).toContain('list_workspaces');
  });

  it('sends the server instructions on initialize, within the byte budget', async () => {
    const { POST } = await import('./route');
    const { buildInstructions } = await import('@/mcp/instructions');
    const { TOOLS } = await import('@/mcp/tools');
    resolve.mockResolvedValue(okResolution);
    const clientInfo = { name: 't', version: '0' };
    const params = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo };
    const r = await POST(post(rpc('initialize', params)));
    const body = (await readRpc(r)) as { result: { instructions?: string } };
    expect(body.result.instructions).toBe(buildInstructions(TOOLS));
    // Claude Code is reported to cut instructions off at 2048 bytes.
    expect(Buffer.byteLength(body.result.instructions ?? '', 'utf8')).toBeLessThanOrEqual(2048);
    expect(body.result.instructions).toContain('create_signup');
  });

  it('answers GET with 405 without metering or reading a token, since there are no sessions', async () => {
    const { GET } = await import('./route');
    consume.mockClear();
    resolve.mockClear();
    const r = GET();
    expect(r.status).toBe(405);
    expect(r.headers.get('Allow')).toBe('POST');
    expect(consume).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects a declared oversize body with 413 before metering or reading it', async () => {
    const { POST } = await import('./route');
    consume.mockClear();
    const r = await POST(post('x', { ...HEADERS, 'content-length': '2000000' }));
    expect(r.status).toBe(413);
    expect(consume).not.toHaveBeenCalled();
  });

  it('stops reading a chunked body at the byte cap and answers 413', async () => {
    const { POST } = await import('./route');
    resolve.mockClear();
    const chunk = new Uint8Array(64 * 1024).fill(0x20);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 4_000_000) return controller.close();
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const r = await POST(post(stream));
    expect(r.status).toBe(413);
    expect(sent).toBeLessThan(4_000_000);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('answers bad JSON with the JSON-RPC parse error before touching the token', async () => {
    const { POST } = await import('./route');
    resolve.mockClear();
    const r = await POST(post('{not json'));
    expect(r.status).toBe(400);
    expect(((await readRpc(r)) as { error: { code: number } }).error.code).toBe(-32700);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('refuses a batch larger than the cap', async () => {
    const { POST } = await import('./route');
    resolve.mockClear();
    const batch = Array.from({ length: 21 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'tools/list' }));
    const r = await POST(post(JSON.stringify(batch)));
    expect(r.status).toBe(400);
    expect(((await readRpc(r)) as { error: { code: number } }).error.code).toBe(-32600);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('answers 429 with Retry-After when the bucket is exhausted', async () => {
    const { POST } = await import('./route');
    const { ServiceException, serviceError } = await import('@/lib/errors');
    consume.mockImplementationOnce(async () => {
      throw new ServiceException(serviceError('rate_limited', 'x', { details: { retryAfterSeconds: 12 } }));
    });
    const r = await POST(post(rpc('tools/list')));
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('12');
  });
});
