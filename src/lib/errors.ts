import { ZodError, type ZodIssueCode } from 'zod';
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

/**
 * `details.reason`: which of the cases one `code` covers an error is, where a
 * client words them differently and `code` (with `field`) can't tell it which.
 * A closed set like `ErrorCode`, so a client can map each to its own text, in
 * its own language; `message` and `suggestion` stay English, for API callers.
 * Most errors carry no reason, because their code says it already, and a
 * client meeting one it doesn't know falls back on the code.
 *
 * - `refusal` (`invalid_input`): Magic Compose's AI declined the description;
 *   `message` is its own explanation.
 * - `asked_again` (`invalid_input`): Magic Compose's AI asked its questions
 *   again after they were answered.
 * - `email_required` (`invalid_input` on `email`): the signup asks for an
 *   email, and none was given.
 * - `email_invalid` (`invalid_input` on `email`): not an email address, or
 *   longer than one can be (254 characters).
 * - `name_required` (`invalid_input` on `name`): blank once trimmed.
 * - `name_too_long` (`invalid_input` on `name`): over `NAME_MAX_LENGTH`.
 * - `notes_too_long` (`invalid_input` on `notes`): over `NOTES_MAX_LENGTH`.
 * - `quantity_too_small` (`invalid_input` on `quantity`): under 1.
 * - `quantity_too_large` (`invalid_input` on `quantity`): over `QUANTITY_MAX`.
 * - `quantity_not_whole` (`invalid_input` on `quantity`): not a whole number.
 *
 * The participant ones come from signing up and from the edit link
 * (`POST /api/slots/[id]/commitments`, `PATCH /api/commitments/[id]`) and
 * nowhere else: a `name` elsewhere in the API follows its own rules. See
 * `COMMITMENT_INPUT_REASONS` for how the input checks map to them.
 */
export type ErrorReason =
  | 'refusal'
  | 'asked_again'
  | 'email_required'
  | 'email_invalid'
  | 'name_required'
  | 'name_too_long'
  | 'notes_too_long'
  | 'quantity_too_small'
  | 'quantity_too_large'
  | 'quantity_not_whole';

export interface ServiceError {
  code: ErrorCode;
  message: string;
  /** Specific field responsible for the error, if applicable (LLM-friendly). */
  field?: string;
  received?: unknown;
  expected?: string;
  /** Human-and-LLM-friendly suggestion to resolve the error. */
  suggestion?: string;
  /**
   * Attached data, e.g. capacity_full returning alternative slots, and the
   * error's `reason` when it has one (see `ErrorReason`).
   */
  details?: Record<string, unknown> & { reason?: ErrorReason };
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

/**
 * The `ErrorReason` for each Zod issue a client words in its own way, by the
 * issue's field path and issue code, as in
 * `{ quantity: { too_big: 'quantity_too_large' } }`. Kept beside the schema it
 * describes and handed to `fromZodError` by the service that parses with it.
 */
export type ZodIssueReasons = Readonly<
  Record<string, Readonly<Partial<Record<ZodIssueCode, ErrorReason>>>>
>;

/**
 * The `invalid_input` for a failed parse, from its first issue. With
 * `reasons`, an issue the table names also gets `details.reason`; the other
 * fields are the same with or without it, so Zod's English `message` and the
 * `suggestion` still reach API callers as before. An issue the table doesn't
 * name gets no reason, and a client words it from the code.
 */
export function fromZodError(error: ZodError, reasons?: ZodIssueReasons): ServiceError {
  const first = error.issues[0];
  const field = first?.path.join('.') || undefined;
  const received = first && 'received' in first ? (first.received as unknown) : undefined;
  const expected =
    first && 'expected' in first ? String((first as { expected: unknown }).expected) : undefined;
  const reason = first && field !== undefined ? reasons?.[field]?.[first.code] : undefined;
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
    ...(reason !== undefined ? { details: { reason } } : {}),
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

/** What REST and MCP both answer for an error they can't explain, with no stack or database message. */
export const INTERNAL_ERROR: ServiceError = { code: 'internal', message: 'something went wrong' };

/**
 * The one mapping from a thrown error to a ServiceError, shared by `handle()`
 * for REST and `runTool()` for MCP so both answer the same way. Null means it
 * is a real failure: the caller logs it, in its own words, and answers
 * INTERNAL_ERROR.
 */
export function serviceErrorFromThrown(e: unknown): ServiceError | null {
  if (e instanceof ZodError) return fromZodError(e);
  if (e instanceof ServiceException) return e.serviceError;
  return null;
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
