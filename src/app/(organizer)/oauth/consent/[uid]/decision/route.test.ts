import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { waitInMinutes } from '@/lib/format-duration';

vi.mock('@/lib/env', () => ({ getEnv: () => ({ AUTH_URL: 'https://signup.example.org' }) }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) as unknown }));
// The signed-in organizer and the language stored on their account.
const request = vi.hoisted(() => ({ locale: null as string | null, realText: false }));
vi.mock('@/auth/session', () => ({
  getOrganizerSession: async () => ({
    organizerId: 'org_1',
    email: 'pat@example.com',
    locale: request.locale,
  }),
  toActor: () => ({
    kind: 'organizer',
    id: 'org_1',
    email: 'pat@example.com',
    workspaceIds: [],
    workspaceRoles: {},
  }),
}));
vi.mock('@/oauth/provider', () => ({
  renderErrorPage: (
    { error, error_description }: { error: string; error_description: string },
    locale: string,
  ) => `<p lang="${locale}">${error} — ${error_description}</p>`,
}));
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`), or with its real
// text where a test asks for it.
vi.mock('@/i18n/server', async () => {
  const { getTestServerTranslator } = await import('@/i18n/testing/translator');
  const { getTranslator } = await import('@/i18n/translator');
  type Namespace = Parameters<typeof getTranslator>[1];
  return {
    instanceDefaultLocale: () => undefined,
    getServerTranslator: (locale: string, namespace: Namespace) =>
      request.realText
        ? getTranslator(locale as 'en', namespace, {
            onError: (error) => {
              throw error;
            },
          })
        : getTestServerTranslator(locale, namespace),
  };
});
afterEach(() => {
  request.locale = null;
  request.realText = false;
});

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

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
    headers: {
      origin: 'https://signup.example.org',
      'content-type': 'application/x-www-form-urlencoded',
    },
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
    expect(page).toContain('Too many connection attempts. Wait 10 minutes and try again.');
    expect(decide).not.toHaveBeenCalled();
  });

  it('says in English that the decision failed, as before', async () => {
    const { POST } = await import('./route');
    decide.mockRejectedValueOnce(new Error('database down'));
    const r = await POST(submit(), params);
    expect(r.status).toBe(500);
    expect(await r.text()).toBe(
      '<p lang="en">server_error — Something went wrong recording your decision. Nothing was connected.</p>',
    );
  });

  describe.each(OTHER_LANGUAGES)('for an organizer whose language is %s', (other) => {
    beforeEach(shipOnlyEnglish);

    it('stays English while that language hasn’t shipped to organizers', async () => {
      request.locale = other;
      const { POST } = await import('./route');
      check.mockResolvedValueOnce(600);
      expect(await (await POST(submit(), params)).text()).toBe(
        '<p lang="en">too_many_requests — Too many connection attempts. Wait 10 minutes and try again.</p>',
      );
    });

    it('replies in it once it has shipped to organizers', async () => {
      ship('organizer', ['en', other]);
      request.locale = other;
      const { POST } = await import('./route');
      check.mockResolvedValueOnce(600);
      expect(await (await POST(submit(), params)).text()).toBe(
        `<p lang="${other}">too_many_requests — auth.consent.decision.tooManyAttempts in ${other}</p>`,
      );
      decide.mockRejectedValueOnce(new Error('database down'));
      expect(await (await POST(submit(), params)).text()).toBe(
        `<p lang="${other}">server_error — auth.consent.decision.failed in ${other}</p>`,
      );
    });

    it('says how long to wait in it', async () => {
      ship('organizer', ['en', other]);
      request.locale = other;
      request.realText = true;
      const { POST } = await import('./route');
      check.mockResolvedValueOnce(600);
      const wait = waitInMinutes(600, other);
      expect(wait).not.toBe(waitInMinutes(600, 'en'));
      expect(await (await POST(submit(), params)).text()).toContain(wait);
    });
  });
});
