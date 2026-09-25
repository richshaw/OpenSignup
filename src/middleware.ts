import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ORGANIZER_CALLBACK_HEADER } from '@/auth/callback-url';

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
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ORGANIZER_CALLBACK_HEADER, organizerCallbackPath(request));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/app', '/app/:path*'],
};
