import { z } from 'zod';
import { NAME_MAX_LENGTH } from '@/lib/participant-limits';

export function idOf<P extends string>(prefix: P) {
  const re = new RegExp(`^${prefix}_[A-Za-z0-9]{22}$`);
  return z.string().regex(re, `expected ${prefix} id`);
}

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

// Normalize before validating so callers can pass raw input with surrounding
// whitespace; max(254) is enforced on the raw string to reject pathologically
// long inputs even when most of it is whitespace.
export const EmailSchema = z.string().max(254).transform(normalizeEmail).pipe(z.string().email());

// Trimmed before the min(1) check, like EmailSchema, so a name of only spaces
// is refused rather than stored blank. max(NAME_MAX_LENGTH) is on the raw string.
export const NameSchema = z
  .string()
  .max(NAME_MAX_LENGTH)
  .transform((v) => v.trim())
  .pipe(z.string().min(1, 'name is required'));

/** The top of the int `sort_order` column on slots and slot fields. */
export const MAX_SORT_ORDER = 2_147_483_647;

// Bounded by the column, so a value past it is invalid_input on sortOrder
// rather than an out-of-range error from Postgres.
export const SortOrderSchema = z.number().int().nonnegative().max(MAX_SORT_ORDER);

/**
 * An array of at most `max` items, whose length is checked before any item is.
 * Zod 3 parses every item even once `.max()` has failed, recording an issue for
 * each bad one, so a 1 MB body of half a million wrong items built half a million
 * issues (some 150 MB) in a single request. This refuses a too-long array with
 * one issue instead, and the items are only parsed once the length is in bounds.
 * The JSON Schema an MCP client sees is the inner array's, `maxItems` included.
 */
export function boundedArray<T extends z.ZodTypeAny>(
  item: T,
  { min, max }: { min?: number; max: number },
) {
  const array = z.array(item).max(max);
  return z.preprocess(
    (value, ctx) => {
      if (Array.isArray(value) && value.length > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_big,
          maximum: max,
          type: 'array',
          inclusive: true,
          fatal: true,
        });
      }
      return value;
    },
    min === undefined ? array : array.min(min),
  );
}

export const TagsSchema = boundedArray(z.string().min(1).max(40), { max: 20 }).default([]);
