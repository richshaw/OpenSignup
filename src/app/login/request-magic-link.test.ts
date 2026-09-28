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
import { ServiceException, serviceError } from '@/lib/errors';
import { log } from '@/lib/log';
import { requestMagicLink } from './request-magic-link';

const email = 'pat@example.com';
const callbackUrl = '/app/signups';
const VERIFY_REQUEST_URL =
  'http://localhost:3000/api/auth/verify-request?provider=nodemailer&type=email';

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
    const { signIn } = NextAuth({
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
    return { signIn, authLog };
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

  it('resolves to the error page when the send is rate-limited', async () => {
    const { signIn } = authWith(async () => {
      throw new ServiceException(serviceError('rate_limited', 'too many requests'));
    });
    const url = new URL(await signIn('nodemailer', options));
    expect(`${url.pathname}${url.search}`).toBe('/login?error=Configuration');
    expect(await requestMagicLink(signIn, { email, callbackUrl })).toEqual({
      ok: false,
      reason: 'send_failed',
    });
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
