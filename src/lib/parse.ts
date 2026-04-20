import type { z } from 'zod';
import { fromZodError, type ServiceError } from './errors';
import { err, ok, type Result } from './result';

export function parseInputSafe<T extends z.ZodTypeAny>(
  schema: T,
  raw: unknown,
): Result<z.output<T>, ServiceError> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return err(fromZodError(parsed.error));
  return ok(parsed.data);
}
