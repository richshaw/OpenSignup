import { describe, expect, it, vi } from 'vitest';

const resolve = vi.fn();
vi.mock('@/auth/bearer', () => ({ resolveBearerActor: (...a: unknown[]) => resolve(...a) }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) as unknown }));
const consume = vi.fn(async () => {});
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, consumeRateLimit: (...args: unknown[]) => consume(...(args as [])) };
});

describe('/api/mcp placeholder', () => {
  it('meters by IP before touching the token, and passes the seam response through', async () => {
    const { GET } = await import('./route');
    const challenge = new Response(null, { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } });
    resolve.mockResolvedValueOnce({ ok: false, response: challenge });
    const r = await GET(new Request('https://x.test/api/mcp', { headers: { 'x-forwarded-for': '203.0.113.9' } }));
    expect(r).toBe(challenge);
    const [, policy, subject] = consume.mock.calls.at(-1) as unknown as [unknown, { bucket: string }, string];
    expect(policy.bucket).toBe('mcp.ip');
    expect(subject).toBe('203.0.113.9');
  });

  it('never returns account details — only that the token was accepted and its scopes', async () => {
    const { POST } = await import('./route');
    resolve.mockResolvedValueOnce({
      ok: true,
      actor: { kind: 'organizer', id: 'org_1', email: 'a@example.com', workspaceIds: ['ws_1'], workspaceRoles: { ws_1: 'owner' } },
      scopes: ['signups:read'],
      clientId: 'c',
    });
    const r = await POST(new Request('https://x.test/api/mcp', { method: 'POST' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({ data: { authenticated: true, scopes: ['signups:read'], mcp: 'not yet available' } });
    expect(JSON.stringify(body)).not.toMatch(/org_1|example\.com|ws_1/);
  });

  it('answers 429 with Retry-After when the bucket is exhausted', async () => {
    const { GET } = await import('./route');
    const { ServiceException, serviceError } = await import('@/lib/errors');
    consume.mockImplementationOnce(async () => {
      throw new ServiceException(serviceError('rate_limited', 'x', { details: { retryAfterSeconds: 12 } }));
    });
    const r = await GET(new Request('https://x.test/api/mcp'));
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('12');
  });
});
