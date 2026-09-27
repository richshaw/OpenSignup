import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { ORGANIZER_CALLBACK_HEADER } from '@/auth/callback-url';
import { middleware, organizerCallbackPath } from './middleware';

function requestFor(path: string, headers?: HeadersInit): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

/** The request header value `NextResponse.next` forwards to the page. */
function forwardedCallback(res: Response): string | null {
  return res.headers.get(`x-middleware-request-${ORGANIZER_CALLBACK_HEADER}`);
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
