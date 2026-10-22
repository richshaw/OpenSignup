import { ZodError } from 'zod';
import { err, type Result } from './result';

export type ErrorCode =
  | 'not_found'
  | 'conflict'
  | 'capacity_full'
  | 'closed'
  | 'forbidden'
  | 'unauthorized'
  | 'invalid_input'
  | 'rate_limited'
  | 'already_consumed'
  | 'internal';

const HTTP_STATUS: Record<ErrorCode, number> = {
  not_found: 404,
  conflict: 409,
  capacity_full: 409,
  closed: 409,
  forbidden: 403,
  unauthorized: 401,
  invalid_input: 400,
  rate_limited: 429,
  already_consumed: 410,
  internal: 500,
};

export interface ServiceError {
  code: ErrorCode;
  message: string;
  /** Specific field responsible for the error, if applicable (LLM-friendly). */
  field?: string;
  received?: unknown;
  expected?: string;
  /** Human-and-LLM-friendly suggestion to resolve the error. */
  suggestion?: string;
  /** Attached data, e.g. capacity_full returning alternative slots. */
  details?: Record<string, unknown>;
}

export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code];
}

export function serviceError(
  code: ErrorCode,
  message: string,
  extras: Omit<ServiceError, 'code' | 'message'> = {},
): ServiceError {
  return { code, message, ...extras };
}

export function fromZodError(error: ZodError): ServiceError {
  const first = error.issues[0];
  const field = first?.path.join('.') || undefined;
  const received = first && 'received' in first ? (first.received as unknown) : undefined;
  const expected =
    first && 'expected' in first ? String((first as { expected: unknown }).expected) : undefined;
  return {
    code: 'invalid_input',
    message: first?.message ?? 'invalid input',
    ...(field !== undefined ? { field } : {}),
    ...(received !== undefined ? { received } : {}),
    ...(expected !== undefined ? { expected } : {}),
    suggestion:
      first?.message && first.path.length > 0
        ? `Check the value of "${first.path.join('.')}".`
        : 'Check your request payload.',
  };
}

/**
 * Thrown by code paths that are supposed to return Result<> but need to
 * short-circuit from deep inside a transaction. Caught by the route handler.
 */
export class ServiceException extends Error {
  constructor(public readonly serviceError: ServiceError) {
    super(serviceError.message);
    this.name = 'ServiceException';
  }
}

/**
 * Runs a service call for a server action, so a refusal comes back the same
 * way however the service made it: a policy guard throws a ServiceException (a
 * viewer's role), the rest return one. A server action has no `handle()` to
 * catch the throw, so without this the organizer lands on the error page.
 * Anything else thrown is a real failure and goes on up.
 */
export async function refusalAsResult<T>(
  run: () => Promise<Result<T, ServiceError>>,
): Promise<Result<T, ServiceError>> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof ServiceException) return err(e.serviceError);
    throw e;
  }
}
