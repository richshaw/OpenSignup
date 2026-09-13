import { describe, expect, it, vi } from 'vitest';

const seen: { url?: string; method?: string }[] = [];
vi.mock('./instance', () => ({
  getProvider: async () => ({
    callback: () => (req: { url: string; method: string }, res: { statusCode: number; end: (b?: string) => void }) => {
      seen.push({ url: req.url, method: req.method });
      res.statusCode = 200;
      res.end('ok');
    },
  }),
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) as unknown }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ AUTH_URL: 'https://signup.example.org' }) }));
const consume = vi.fn(async () => {});
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, consumeRateLimit: (...args: unknown[]) => consume(...(args as [])) };
});

describe('handleOAuthRequest', () => {
  it('forwards the query string to the provider — the authorization endpoint lives on it', async () => {
    const { handleOAuthRequest } = await import('./handler');
    const r = await handleOAuthRequest(
      new Request('https://signup.example.org/api/oauth/authorize?client_id=abc&response_type=code'),
    );
    expect(r.status).toBe(200);
    expect(seen.at(-1)?.url).toBe('/api/oauth/authorize?client_id=abc&response_type=code');
  });

  it('lets a well-known route override the provider path', async () => {
    const { handleOAuthRequest } = await import('./handler');
    await handleOAuthRequest(new Request('https://signup.example.org/.well-known/openid-configuration'), {
      path: '/.well-known/oauth-authorization-server',
    });
    expect(seen.at(-1)?.url).toBe('/.well-known/oauth-authorization-server');
  });

  it('meters token, authorize and other paths in their own buckets, with unknown IPs pooled', async () => {
    const { handleOAuthRequest } = await import('./handler');
    consume.mockClear();
    await handleOAuthRequest(new Request('https://signup.example.org/api/oauth/token', { method: 'POST' }));
    await handleOAuthRequest(new Request('https://signup.example.org/api/oauth/authorize/abc', { headers: { 'x-forwarded-for': '203.0.113.5' } }));
    await handleOAuthRequest(new Request('https://signup.example.org/api/oauth/jwks'));
    const calls = consume.mock.calls as unknown as [unknown, { bucket: string }, string][];
    expect(calls.map((c) => [c[1].bucket, c[2]])).toEqual([
      ['oauth.token.ip', 'unknown'],
      ['oauth.authorize.ip', '203.0.113.5'],
      ['oauth.other.ip', 'unknown'],
    ]);
  });

  it('answers a rate-limited request with 429 and Retry-After, as JSON or HTML by Accept', async () => {
    const { handleOAuthRequest } = await import('./handler');
    const { ServiceException, serviceError } = await import('@/lib/errors');
    consume.mockImplementationOnce(async () => {
      throw new ServiceException(serviceError('rate_limited', 'too many', { details: { retryAfterSeconds: 42, bucket: 'b' } }));
    });
    const json = await handleOAuthRequest(new Request('https://signup.example.org/api/oauth/token', { method: 'POST' }));
    expect(json.status).toBe(429);
    expect(json.headers.get('retry-after')).toBe('42');
    expect((await json.json()).error).toBe('too_many_requests');
    consume.mockImplementationOnce(async () => {
      throw new ServiceException(serviceError('rate_limited', 'too many', { details: { retryAfterSeconds: 7 } }));
    });
    const html = await handleOAuthRequest(
      new Request('https://signup.example.org/api/oauth/authorize?x=1', { headers: { accept: 'text/html' } }),
    );
    expect(html.status).toBe(429);
    expect(html.headers.get('content-type')).toMatch(/text\/html/);
    expect(await html.text()).toContain('too_many_requests');
    consume.mockImplementationOnce(async () => {
      throw new ServiceException(serviceError('rate_limited', 'too many', { details: { retryAfterSeconds: 540 } }));
    });
    const long = await handleOAuthRequest(
      new Request('https://signup.example.org/api/oauth/authorize?x=1', { headers: { accept: 'text/html' } }),
    );
    expect(await long.text()).toContain('Wait 9 minutes');
  });
});

describe('policyFor', () => {
  it('normalises case and trailing slashes and fails tight on unknown paths', async () => {
    const { policyFor } = await import('./handler');
    expect(policyFor('/api/oauth/AUTHORIZE').bucket).toBe('oauth.authorize.ip');
    expect(policyFor('/api/oauth/token/').bucket).toBe('oauth.token.ip');
    // The router strips one trailing slash, not several; match it exactly.
    expect(policyFor('/api/oauth/token//').bucket).toBe('oauth.authorize.ip');
    expect(policyFor('/api/oauth/TOKEN').bucket).toBe('oauth.token.ip');
    expect(policyFor('/api/oauth/par').bucket).toBe('oauth.authorize.ip');
    expect(policyFor('/api/oauth/jwks').bucket).toBe('oauth.other.ip');
    expect(policyFor('/.well-known/oauth-authorization-server').bucket).toBe('oauth.other.ip');
    expect(policyFor('/api/oauth/whatever').bucket).toBe('oauth.authorize.ip');
  });
});
