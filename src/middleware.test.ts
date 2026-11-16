import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { ORGANIZER_CALLBACK_HEADER } from '@/auth/callback-url';
import { SIGNUP_PATH_HEADER } from '@/lib/signup-path';
import { config, middleware, organizerCallbackPath } from './middleware';

function requestFor(path: string, headers?: HeadersInit): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

/** A request header's value as `NextResponse.next` forwards it to the page. */
function forwarded(res: Response, header: string): string | null {
  return res.headers.get(`x-middleware-request-${header}`);
}

function forwardedCallback(res: Response): string | null {
  return forwarded(res, ORGANIZER_CALLBACK_HEADER);
}

describe('organizerCallbackPath', () => {
  it('includes the path and query', () => {
    expect(organizerCallbackPath(requestFor('/app/signups/abc/build?tab=fields'))).toBe(
      '/app/signups/abc/build?tab=fields',
    );
  });

  it('includes the dashboard path', () => {
    expect(organizerCallbackPath(requestFor('/app'))).toBe('/app');
  });
});

describe('middleware', () => {
  it('forwards the requested page to the page as a request header', () => {
    const res = middleware(requestFor('/app/signups/abc/build?tab=fields'));
    expect(forwardedCallback(res)).toBe('/app/signups/abc/build?tab=fields');
  });

  it('replaces a callback header the client sent with the real path', () => {
    const res = middleware(
      requestFor('/app/settings', { [ORGANIZER_CALLBACK_HEADER]: 'https://evil.example/phish' }),
    );
    expect(forwardedCallback(res)).toBe('/app/settings');
  });
});

describe('middleware on public signup paths', () => {
  it.each([
    ['/s/snack-duty', '/s/snack-duty'],
    // The query is left out: on an edit link it is the token.
    ['/s/snack-duty/c/com_1?token=secret', '/s/snack-duty/c/com_1'],
    ['/s/snack-duty/unsubscribe?p=par_1&token=secret', '/s/snack-duty/unsubscribe'],
  ])('forwards the path of %s, without its query', (path, expected) => {
    expect(forwarded(middleware(requestFor(path)), SIGNUP_PATH_HEADER)).toBe(expected);
  });

  it('replaces a path header the client sent with the real path', () => {
    const res = middleware(
      requestFor('/s/snack-duty', { [SIGNUP_PATH_HEADER]: '/s/someone-elses-draft' }),
    );
    expect(forwarded(res, SIGNUP_PATH_HEADER)).toBe('/s/snack-duty');
  });

  // Only /app paths may say where sign-in sends someone.
  it('never sets the callback header', () => {
    expect(forwardedCallback(middleware(requestFor('/s/snack-duty?next=/app')))).toBeNull();
  });

  it('leaves /app paths without the signup path header', () => {
    const res = middleware(requestFor('/app/signups/abc/build'));
    expect(forwarded(res, SIGNUP_PATH_HEADER)).toBeNull();
    expect(forwardedCallback(res)).toBe('/app/signups/abc/build');
  });
});

describe('which paths the middleware runs on', () => {
  const runsOn = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it.each(['/app', '/app/signups/abc/build', '/s/snack-duty', '/s/snack-duty/c/com_1'])(
    'runs on %s',
    (url) => {
      expect(runsOn(url)).toBe(true);
    },
  );

  it.each(['/', '/login', '/api/public/health', '/help', '/apple', '/signups'])(
    'leaves %s alone',
    (url) => {
      expect(runsOn(url)).toBe(false);
    },
  );
});
