import { NextResponse } from 'next/server';
import type { LinkObject } from './links';
import {
  httpStatusFor,
  INTERNAL_ERROR,
  ServiceException,
  serviceError,
  serviceErrorFromThrown,
  type ServiceError,
} from './errors';
import { log } from './log';
import { BodyTooLarge, readRequestBody } from './request-body';
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
  const headers =
    typeof retryAfter === 'number' ? { 'Retry-After': String(retryAfter) } : undefined;
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

/**
 * The most a JSON request body may be, the same cap the MCP endpoint uses for
 * the same inputs. Next.js puts no limit on a route handler's body, and
 * `req.json()` would buffer and parse whatever arrives, so without this one
 * unauthenticated sign-up request could make the server hold any amount.
 */
export const MAX_JSON_BODY_BYTES = 1_000_000;

/**
 * The JSON body, or `{}` when it is missing or malformed; the service's Zod
 * parse judges it. A body over `MAX_JSON_BODY_BYTES` is refused as
 * `invalid_input` before any of it is parsed, and stops being read there.
 */
export async function readJson(req: Request): Promise<unknown> {
  let raw: Buffer;
  try {
    raw = await readRequestBody(req, MAX_JSON_BODY_BYTES);
  } catch (e) {
    if (e instanceof BodyTooLarge) {
      throw new ServiceException(
        serviceError('invalid_input', 'request body too large', {
          details: { maxBytes: MAX_JSON_BODY_BYTES },
          suggestion: 'Send a smaller request.',
        }),
      );
    }
    return {};
  }
  try {
    return JSON.parse(raw.toString('utf8')) as unknown;
  } catch {
    return {};
  }
}

/** Wraps a route handler so any ZodError or thrown ServiceException becomes a proper response. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const se = serviceErrorFromThrown(e);
    if (se) return fail(se);
    log.error({ err: e }, 'unhandled route error');
    return fail(INTERNAL_ERROR);
  }
}
