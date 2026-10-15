import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { LinkObject } from './links';
import { fromZodError, httpStatusFor, ServiceException, type ServiceError } from './errors';
import { log } from './log';
import type { Result } from './result';

interface SuccessEnvelope<T> {
  data: T;
  _links?: Record<string, LinkObject | string>;
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
    links?: Record<string, LinkObject | string>;
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

export function respond<T>(
  result: Result<T, ServiceError>,
  links?: Record<string, LinkObject | string>,
): NextResponse {
  return result.ok ? ok(result.value, { links }) : fail(result.error);
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
