import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// next-auth's signIn reads the request's headers and writes cookies through
// next/headers, which only work inside a Next.js request.
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000', 'x-forwarded-proto': 'http' }),
  cookies: async () => ({ set: () => {} }),
}));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('signIn should not redirect when called with redirect: false');
  },
}));

import NextAuth, { AuthError } from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { NextRequest } from 'next/server';
import { MagicLinkRateLimited } from '@/auth/magic-link-rate-limit';
import { ServiceException, serviceError } from '@/lib/errors';
import { log } from '@/lib/log';
import { requestMagicLink } from './request-magic-link';

const email = 'pat@example.com';
const callbackUrl = '/app/signups';
const VERIFY_REQUEST_URL =
  'http://localhost:3000/api/auth/verify-request?provider=nodemailer&type=email';

/** What consumeRateLimit throws for a request over its limit. */
function overLimit() {
  return new ServiceException(
    serviceError('rate_limited', 'too many requests', {
      details: { retryAfterSeconds: 600, bucket: 'auth.magic.email' },
    }),
  );
}

let logError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logError = vi.spyOn(log, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestMagicLink', () => {
  it('asks the nodemailer provider for a link without redirecting', async () => {
    const signIn = vi.fn(async () => VERIFY_REQUEST_URL);
    await requestMagicLink(signIn, { email, callbackUrl });
    expect(signIn).toHaveBeenCalledWith('nodemailer', {
      email,
      redirect: false,
      redirectTo: callbackUrl,
    });
  });

  it('reports the link sent when signIn resolves to the verify-request page', async () => {
    const result = await requestMagicLink(async () => VERIFY_REQUEST_URL, { email, callbackUrl });
    expect(result).toEqual({ ok: true, email });
    expect(logError).not.toHaveBeenCalled();
  });

  it('reports send_failed when signIn resolves to the error page', async () => {
    const result = await requestMagicLink(
      async () => 'http://localhost:3000/login?error=Configuration',
      { email, callbackUrl },
    );
    expect(result).toEqual({ ok: false, reason: 'send_failed' });
    expect(logError).toHaveBeenCalledWith(
      { authError: 'Configuration', path: '/login' },
      'login: signIn failed',
    );
  });

  it.each([
    // What signIn resolves to when Auth.js rejects its own config.
    ['the sign-in URL it was asked for', 'http://localhost:3000/api/auth/signin/nodemailer?'],
    ['a relative error page', '/login?error=Configuration'],
    ['a string that is not a URL', 'http://'],
    ['something other than a string', undefined],
  ])('reports send_failed when signIn resolves to %s', async (_, url) => {
    const result = await requestMagicLink(async () => url, { email, callbackUrl });
    expect(result).toEqual({ ok: false, reason: 'send_failed' });
    expect(logError).toHaveBeenCalledWith(expect.any(Object), 'login: signIn failed');
  });

  it('reports send_failed when signIn throws', async () => {
    const boom = new Error('smtp down');
    const result = await requestMagicLink(
      async () => {
        throw boom;
      },
      { email, callbackUrl },
    );
    expect(result).toEqual({ ok: false, reason: 'send_failed' });
    expect(logError).toHaveBeenCalledWith({ err: boom }, 'login: signIn failed');
  });

  it('reports rate_limited when signIn throws MagicLinkRateLimited', async () => {
    const result = await requestMagicLink(
      async () => {
        throw new MagicLinkRateLimited(overLimit());
      },
      { email, callbackUrl },
    );
    expect(result).toEqual({ ok: false, reason: 'rate_limited' });
    // Warned where the limit was hit; not an error.
    expect(logError).not.toHaveBeenCalled();
  });

  it('reports send_failed for any other AuthError signIn throws', async () => {
    const result = await requestMagicLink(
      async () => {
        throw new AuthError('refused');
      },
      { email, callbackUrl },
    );
    expect(result).toEqual({ ok: false, reason: 'send_failed' });
  });

  it('never logs the email address', async () => {
    await requestMagicLink(async () => 'http://localhost:3000/login?error=Configuration', {
      email,
      callbackUrl,
    });
    await requestMagicLink(
      async () => {
        throw new Error('smtp down');
      },
      { email, callbackUrl },
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain(email);
  });
});

/**
 * Pins what the installed Auth.js does when `sendVerificationRequest` fails,
 * which is the whole reason requestMagicLink cannot trust a resolved signIn.
 * `src/auth/config.ts` builds the same provider; its own dependencies (the
 * database, the email transport) are what these stand-ins replace.
 */
describe('requestMagicLink with the real next-auth signIn', () => {
  function authWith(send: () => Promise<void>) {
    // Auth.js starts the send, then hashes and stores the token, and only
    // then awaits both. Failing once the token is stored keeps a send that
    // throws at once from being an unhandled rejection in the meantime; the
    // real one awaits the rate limit and the database before it can throw.
    let tokenStored = () => {};
    const authLog = vi.fn();
    const { signIn, handlers } = NextAuth({
      secret: 'test-secret-that-is-not-used-anywhere-else',
      trustHost: true,
      logger: { error: authLog },
      adapter: {
        getUserByEmail: async () => null,
        createVerificationToken: async (token) => {
          tokenStored();
          return token;
        },
        useVerificationToken: async () => null,
      },
      providers: [
        Nodemailer({
          server: 'smtp://user:pass@localhost:2525',
          from: 'noreply@opensignup.invalid',
          async sendVerificationRequest() {
            await new Promise<void>((resolve) => {
              tokenStored = resolve;
            });
            await send();
          },
        }),
      ],
      pages: { signIn: '/login', verifyRequest: '/login/check', error: '/login' },
    });
    return { signIn, handlers, authLog };
  }

  /**
   * The same request made over HTTP, as a browser or script posting to
   * `/api/auth/signin/nodemailer` does, CSRF token and all. Auth.js runs
   * without `raw` here, so it rethrows nothing.
   */
  async function postSignIn(
    handlers: ReturnType<typeof authWith>['handlers'],
    headers: Record<string, string> = {},
  ) {
    const csrf = await handlers.GET(new NextRequest('http://localhost:3000/api/auth/csrf'));
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    const cookie = csrf.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const res = await handlers.POST(
      new NextRequest('http://localhost:3000/api/auth/signin/nodemailer', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, ...headers },
        body: new URLSearchParams({ csrfToken, email, callbackUrl }),
      }),
    );
    return { status: res.status, location: res.headers.get('location'), body: await res.text() };
  }

  const options = { email, redirect: false, redirectTo: callbackUrl } as const;

  it('resolves to the verify-request page when the send works', async () => {
    const { signIn, authLog } = authWith(async () => {});
    const url = new URL(await signIn('nodemailer', options));
    expect(url.pathname).toBe('/api/auth/verify-request');
    expect(await requestMagicLink(signIn, { email, callbackUrl })).toEqual({ ok: true, email });
    expect(authLog).not.toHaveBeenCalled();
  });

  it('resolves to the error page, not a throw, when the send throws an Error', async () => {
    const { signIn, authLog } = authWith(async () => {
      throw new Error('magic link send timed out after 30 s');
    });
    const url = new URL(await signIn('nodemailer', options));
    expect(`${url.pathname}${url.search}`).toBe('/login?error=Configuration');
    expect(authLog).toHaveBeenCalled();
    expect(await requestMagicLink(signIn, { email, callbackUrl })).toEqual({
      ok: false,
      reason: 'send_failed',
    });
  });

  it('resolves to the error page when the send throws the rate limit unwrapped', async () => {
    // Why src/auth/magic-link-rate-limit.ts wraps it.
    const { signIn } = authWith(async () => {
      throw overLimit();
    });
    const url = new URL(await signIn('nodemailer', options));
    expect(`${url.pathname}${url.search}`).toBe('/login?error=Configuration');
    expect(await requestMagicLink(signIn, { email, callbackUrl })).toEqual({
      ok: false,
      reason: 'send_failed',
    });
  });

  it('throws MagicLinkRateLimited when the send throws it, which reads as rate_limited', async () => {
    const { signIn } = authWith(async () => {
      throw new MagicLinkRateLimited(overLimit());
    });
    await expect(signIn('nodemailer', options)).rejects.toBeInstanceOf(MagicLinkRateLimited);
    expect(await requestMagicLink(signIn, { email, callbackUrl })).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
  });

  it('answers the HTTP sign-in route with MagicLinkRateLimited as it did with the rate limit unwrapped', async () => {
    const wrapped = authWith(async () => {
      throw new MagicLinkRateLimited(overLimit());
    }).handlers;
    const unwrapped = authWith(async () => {
      throw overLimit();
    }).handlers;
    // A plain redirect to the error page, with nothing in it about the limit.
    const redirect = {
      status: 302,
      location: 'http://localhost:3000/login?error=Configuration',
      body: '',
    };
    expect(await postSignIn(wrapped)).toEqual(redirect);
    expect(await postSignIn(unwrapped)).toEqual(redirect);
    // next-auth/react asks for the URL as JSON instead.
    const json = {
      status: 200,
      location: null,
      body: JSON.stringify({ url: redirect.location }),
    };
    const asJson = { 'X-Auth-Return-Redirect': '1' };
    expect(await postSignIn(wrapped, asJson)).toEqual(json);
    expect(await postSignIn(unwrapped, asJson)).toEqual(json);
  });

  it('rethrows an AuthError the send throws', async () => {
    class SendRefused extends AuthError {}
    const { signIn } = authWith(async () => {
      throw new SendRefused('refused');
    });
    await expect(signIn('nodemailer', options)).rejects.toBeInstanceOf(SendRefused);
    expect(await requestMagicLink(signIn, { email, callbackUrl })).toEqual({
      ok: false,
      reason: 'send_failed',
    });
  });
});
