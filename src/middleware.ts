import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ORGANIZER_CALLBACK_HEADER } from '@/auth/callback-url';

/** Path + query for the organizer page the visitor asked for. */
export function organizerCallbackPath(request: NextRequest): string {
  const { pathname, search } = request.nextUrl;
  return `${pathname}${search}`;
}

/**
 * App Router layouts cannot read the request path, so unauthenticated redirects
 * from the organizer chrome used to hard-code `/app`. Copy the path (and query)
 * into a request header the layout can turn into `callbackUrl`.
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ORGANIZER_CALLBACK_HEADER, organizerCallbackPath(request));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/app', '/app/:path*'],
};
