import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ORGANIZER_CALLBACK_HEADER } from '@/auth/callback-url';
import { SIGNUP_PATH_HEADER } from '@/lib/signup-path';

/** Path + query for the organizer page the visitor asked for. */
export function organizerCallbackPath(request: NextRequest): string {
  const { pathname, search } = request.nextUrl;
  return `${pathname}${search}`;
}

/**
 * App Router layouts and pages cannot read the request path, so a signed-out
 * visit had no way to say where to come back to after sign-in. Copy the path
 * (and query) into a request header that `requireOrganizerSession` turns into
 * `callbackUrl`. `set` replaces any value the client sent, so the header always
 * names the page that was actually requested.
 *
 * Public signup paths (`/s/...`) get a header of their own instead,
 * `SIGNUP_PATH_HEADER`, holding the path alone, for the pages there that get
 * no params. The callback header is only ever set on `/app` paths, so nothing
 * on a public page can choose where sign-in sends someone.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  // The matcher sends only `/app` and `/s` paths here.
  if (pathname.startsWith('/app')) {
    requestHeaders.set(ORGANIZER_CALLBACK_HEADER, organizerCallbackPath(request));
  } else if (pathname.startsWith('/s/')) {
    requestHeaders.set(SIGNUP_PATH_HEADER, pathname);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/app', '/app/:path*', '/s/:path*'],
};
