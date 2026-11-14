import type { z } from 'zod';
import { fromZodError, type ServiceError, type ZodIssueReasons } from './errors';
import { err, ok, type Result } from './result';

/**
 * Parses `raw` with `schema`, or gives the `invalid_input` for its first
 * issue. `reasons` names the issues that get a `details.reason` (see
 * `fromZodError`).
 */
export function parseInputSafe<T extends z.ZodTypeAny>(
  schema: T,
  raw: unknown,
  reasons?: ZodIssueReasons,
): Result<z.output<T>, ServiceError> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return err(fromZodError(parsed.error, reasons));
  return ok(parsed.data);
}
