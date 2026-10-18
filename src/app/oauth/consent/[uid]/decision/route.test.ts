import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({ getEnv: () => ({ AUTH_URL: 'https://signup.example.org' }) }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) as unknown }));
vi.mock('@/auth/session', () => ({
  requireActor: async () => ({ kind: 'organizer', id: 'org_1', email: 'pat@example.com', workspaceIds: [], workspaceRoles: {} }),
}));
vi.mock('@/oauth/provider', () => ({
  renderErrorPage: ({ error, error_description }: { error: string; error_description: string }) =>
    `<p>${error} — ${error_description}</p>`,
  describeWait: (seconds: number) => `${seconds} seconds`,
}));
const decide = vi.fn(async (..._args: unknown[]) => new Response(null, { status: 303 }));
vi.mock('@/oauth/consent', () => ({
  ConsentUnavailable: class extends Error {},
  decideConsent: (...args: unknown[]) => decide(...args),
}));
const check = vi.fn(async (..._args: unknown[]): Promise<number | null> => null);
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, chargeRateLimit: (...args: unknown[]) => check(...args) };
});

function submit(): Request {
  const body = new URLSearchParams({ decision: 'approve' });
  return new Request('https://signup.example.org/oauth/consent/abc/decision', {
    method: 'POST',
    headers: { origin: 'https://signup.example.org', 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}
const params = { params: Promise.resolve({ uid: 'abc' }) };

describe('POST /oauth/consent/[uid]/decision', () => {
  it('records the decision while the organizer is under the consent limit', async () => {
    const { POST } = await import('./route');
    decide.mockClear();
    const r = await POST(submit(), params);
    expect(r.status).toBe(303);
    expect(decide).toHaveBeenCalledOnce();
    const [, policy, subject] = check.mock.calls.at(-1) as [unknown, { bucket: string }, string];
    expect([policy.bucket, subject]).toEqual(['oauth.consent.org', 'org_1']);
  });

  it('answers 429 and records nothing once the organizer is over the limit', async () => {
    const { POST } = await import('./route');
    decide.mockClear();
    check.mockResolvedValueOnce(600);
    const r = await POST(submit(), params);
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('600');
    expect(r.headers.get('cache-control')).toBe('no-store');
    const page = await r.text();
    expect(page).toContain('too_many_requests');
    expect(page).toContain('Too many connection attempts. Wait 600 seconds and try again.');
    expect(decide).not.toHaveBeenCalled();
  });
});
