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
 * client words them differently. A closed set like `ErrorCode`, so a client
 * can key its own text, in its own language, on code and reason; `message`
 * and `suggestion` stay English, for API callers. Most errors carry no
 * reason, because their code says it already, and a client meeting one it
 * doesn't know falls back on the code. Magic Compose's provider failures name
 * their kind in `details.llmErrorCode` instead.
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
 * - `quantity_not_whole` (`invalid_input` on `quantity`): not a whole number
 *   (a fraction, or not a number at all).
 *
 * The participant ones come from signing up and from the edit link
 * (`POST /api/slots/[id]/commitments`, `PATCH /api/commitments/[id]`) and
 * nowhere else: a `name` elsewhere in the API follows its own rules. See
 * `COMMITMENT_INPUT_REASONS` for how the input checks map to them.
 *
 * The organizer ones mark each refusal an organizer screen words in a way of
 * its own, rather than with the line for its code. The API sends them wherever
 * it refuses that way, the AI connector's tools included:
 *
 * - `title_too_short` (`invalid_input` on `title`): under `TITLE_MIN_LENGTH`
 *   once trimmed, creating or updating a signup (`SIGNUP_INPUT_REASONS`).
 * - `date_too_early` (`invalid_input` on a date field's ref): a slot's date is
 *   a real day, but before `MIN_DATE_YEAR`.
 * - `slot_ids_mismatch` (`invalid_input` on `slotIds`) and
 *   `field_ids_mismatch` (`invalid_input` on `fieldIds`): a new order that
 *   doesn't name every slot, or every field, of the signup exactly once, as
 *   when another window has added or removed one since.
 * - `slot_has_signups` (`conflict` on `slotId`): deleting a slot people have
 *   signed up for, without `force`; `details.filled` counts their spots.
 * - `capacity_below_taken` (`conflict` on `capacity`): fewer spots than are
 *   taken; `received` is the capacity sent and `details.taken` the spots taken.
 * - `invalidates_slot_values` (`conflict`): a field's new type or settings
 *   would make values its slots hold invalid.
 * - `status_changed` (`conflict` on `status`): publishing, closing, reopening
 *   or archiving a signup that isn't in the status that needs.
 * - `no_slots` (`conflict` on `slots`): publishing or reopening a signup with
 *   no slots.
 * - `draft_invalid` (`internal`): Magic Compose's AI wrote a draft that isn't
 *   the shape a signup needs.
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
  | 'quantity_not_whole'
  | 'title_too_short'
  | 'date_too_early'
  | 'slot_ids_mismatch'
  | 'field_ids_mismatch'
  | 'slot_has_signups'
  | 'capacity_below_taken'
  | 'invalidates_slot_values'
  | 'status_changed'
  | 'no_slots'
  | 'draft_invalid';

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
