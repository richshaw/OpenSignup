import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { waitInMinutes } from '@/lib/format-duration';

const seen: { url?: string; method?: string }[] = [];
vi.mock('./instance', () => ({
  getProvider: async () => ({
    callback:
      () =>
      (
        req: { url: string; method: string },
        res: { statusCode: number; end: (b?: string) => void },
      ) => {
        seen.push({ url: req.url, method: req.method });
        res.statusCode = 200;
        res.end('ok');
      },
  }),
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) as unknown }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ AUTH_URL: 'https://signup.example.org' }) }));
// The instance's DEFAULT_LOCALE. English comes from the catalog; any other
// language answers with the key it was asked for and the language
// (`getTestServerTranslator`), or with its real text where a test asks.
const instance = vi.hoisted(() => ({
  defaultLocale: undefined as string | undefined,
  realText: false,
}));
vi.mock('@/i18n/server', async () => {
  const { getTestServerTranslator } = await import('@/i18n/testing/translator');
  const { getTranslator } = await import('@/i18n/translator');
  type Namespace = Parameters<typeof getTranslator>[1];
  return {
    instanceDefaultLocale: () => instance.defaultLocale,
    getServerTranslator: (locale: string, namespace: Namespace) =>
      instance.realText
        ? getTranslator(locale as 'en', namespace, {
            onError: (error) => {
              throw error;
            },
          })
        : getTestServerTranslator(locale, namespace),
  };
});
afterEach(() => {
  instance.defaultLocale = undefined;
  instance.realText = false;
});

/** A browser's authorization request, over its rate limit for `retryAfter` seconds. */
async function rateLimitedPage(retryAfter: number): Promise<Response> {
  const { handleOAuthRequest } = await import('./handler');
  consume.mockResolvedValueOnce(retryAfter);
  return handleOAuthRequest(
    new Request('https://signup.example.org/api/oauth/authorize?x=1', {
      headers: { accept: 'text/html' },
    }),
  );
}
const consume = vi.fn(async (): Promise<number | null> => null);
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, chargeRateLimit: (...args: unknown[]) => consume(...(args as [])) };
});

describe('handleOAuthRequest', () => {
  it('forwards the query string to the provider — the authorization endpoint lives on it', async () => {
    const { handleOAuthRequest } = await import('./handler');
    const r = await handleOAuthRequest(
      new Request(
        'https://signup.example.org/api/oauth/authorize?client_id=abc&response_type=code',
      ),
    );
    expect(r.status).toBe(200);
    expect(seen.at(-1)?.url).toBe('/api/oauth/authorize?client_id=abc&response_type=code');
  });

  it('lets a well-known route override the provider path', async () => {
    const { handleOAuthRequest } = await import('./handler');
    await handleOAuthRequest(
      new Request('https://signup.example.org/.well-known/openid-configuration'),
      {
        path: '/.well-known/oauth-authorization-server',
      },
    );
    expect(seen.at(-1)?.url).toBe('/.well-known/oauth-authorization-server');
  });

  it('meters token, authorize and other paths in their own buckets, with unknown IPs pooled', async () => {
    const { handleOAuthRequest } = await import('./handler');
    consume.mockClear();
    await handleOAuthRequest(
      new Request('https://signup.example.org/api/oauth/token', { method: 'POST' }),
    );
    await handleOAuthRequest(
      new Request('https://signup.example.org/api/oauth/authorize/abc', {
        headers: { 'x-forwarded-for': '203.0.113.5' },
      }),
    );
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
    consume.mockResolvedValueOnce(42);
    const json = await handleOAuthRequest(
      new Request('https://signup.example.org/api/oauth/token', { method: 'POST' }),
    );
    expect(json.status).toBe(429);
    expect(json.headers.get('retry-after')).toBe('42');
    expect((await json.json()).error).toBe('too_many_requests');
    consume.mockResolvedValueOnce(7);
    const html = await handleOAuthRequest(
      new Request('https://signup.example.org/api/oauth/authorize?x=1', {
        headers: { accept: 'text/html' },
      }),
    );
    expect(html.status).toBe(429);
    expect(html.headers.get('content-type')).toMatch(/text\/html/);
    expect(await html.text()).toContain('too_many_requests');
    consume.mockResolvedValueOnce(540);
    const long = await handleOAuthRequest(
      new Request('https://signup.example.org/api/oauth/authorize?x=1', {
        headers: { accept: 'text/html' },
      }),
    );
    expect(await long.text()).toContain('Wait 9 minutes');
  });

  it('words the rate-limit page in English as before', async () => {
    const page = await (await rateLimitedPage(540)).text();
    expect(page).toContain('<html lang="en">');
    expect(page).toContain(
      '<p><code>too_many_requests</code> — Too many requests. Wait 9 minutes and try again.</p>',
    );
  });

  describe.each(TEST_LOCALES)('with DEFAULT_LOCALE=%s', (other) => {
    beforeEach(shipOnlyEnglish);

    it('stays English while that language hasn’t shipped to organizers', async () => {
      instance.defaultLocale = other;
      const page = await (await rateLimitedPage(540)).text();
      expect(page).toContain('<html lang="en">');
      expect(page).toContain('Too many requests. Wait 9 minutes and try again.');
    });

    it('is in that language once it has shipped to organizers', async () => {
      ship('organizer', ['en', other]);
      instance.defaultLocale = other;
      const page = await (await rateLimitedPage(540)).text();
      expect(page).toContain(`<html lang="${other}">`);
      expect(page).toContain(`auth.oauthErrors.tooManyRequests in ${other}`);
      expect(page).toContain(`auth.oauthErrors.heading in ${other}`);
    });

    it('says how long to wait in that language', async () => {
      ship('organizer', ['en', other]);
      instance.defaultLocale = other;
      instance.realText = true;
      const wait = waitInMinutes(540, other);
      expect(wait).not.toBe(waitInMinutes(540, 'en'));
      expect(await (await rateLimitedPage(540)).text()).toContain(wait);
    });

    it('keeps the JSON reply for clients in English', async () => {
      ship('organizer', ['en', other]);
      instance.defaultLocale = other;
      const { handleOAuthRequest } = await import('./handler');
      consume.mockResolvedValueOnce(42);
      const json = await handleOAuthRequest(
        new Request('https://signup.example.org/api/oauth/token', { method: 'POST' }),
      );
      expect(await json.json()).toEqual({
        error: 'too_many_requests',
        error_description: 'too many requests',
      });
    });
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
