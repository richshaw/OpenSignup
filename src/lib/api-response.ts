import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { LinkObject } from './links';
import { fromZodError, httpStatusFor, ServiceException, type ServiceError } from './errors';
import { log } from './log';
import type { Result } from './result';

export type Links = Record<string, LinkObject | string>;

interface SuccessEnvelope<T> {
  data: T;
  _links?: Links;
}

export interface ErrorEnvelope {
  error: {
    code: ServiceError['code'];
    message: string;
    field?: string;
    received?: unknown;
    expected?: string;
    suggestion?: string;
    details?: Record<string, unknown>;
  };
}

export function ok<T>(
  data: T,
  init: {
    links?: Links;
    status?: number;
    headers?: HeadersInit;
  } = {},
): NextResponse {
  const body: SuccessEnvelope<T> = { data };
  if (init.links) body._links = init.links;
  return NextResponse.json(body, { status: init.status ?? 200, headers: init.headers });
}

/** The error body every surface sends: REST via `fail`, MCP via `toolFailure`. */
export function errorEnvelope(error: ServiceError): ErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.field !== undefined ? { field: error.field } : {}),
      ...(error.received !== undefined ? { received: error.received } : {}),
      ...(error.expected !== undefined ? { expected: error.expected } : {}),
      ...(error.suggestion !== undefined ? { suggestion: error.suggestion } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  };
}

/** A rate-limited error that knows its wait also tells the client in `Retry-After`. */
export function fail(error: ServiceError): NextResponse {
  const retryAfter = error.code === 'rate_limited' ? error.details?.retryAfterSeconds : undefined;
  const headers = typeof retryAfter === 'number' ? { 'Retry-After': String(retryAfter) } : undefined;
  return NextResponse.json(errorEnvelope(error), { status: httpStatusFor(error.code), headers });
}

/** Links that name the created or loaded value can be built from it, and only on success. */
export function respond<T>(
  result: Result<T, ServiceError>,
  links?: Links | ((value: T) => Links),
): NextResponse {
  if (!result.ok) return fail(result.error);
  return ok(result.value, { links: typeof links === 'function' ? links(result.value) : links });
}

/** The JSON body, or `{}` when it is missing or malformed; the service's Zod parse judges it. */
export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => ({}));
}

/** Wraps a route handler so any ZodError or thrown ServiceException becomes a proper response. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ZodError) return fail(fromZodError(e));
    if (e instanceof ServiceException) return fail(e.serviceError);
    log.error({ err: e }, 'unhandled route error');
    return fail({ code: 'internal', message: 'something went wrong' });
  }
}
