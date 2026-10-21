import { z } from 'zod';

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
export const EmailSchema = z
  .string()
  .max(254)
  .transform(normalizeEmail)
  .pipe(z.string().email());

// Trimmed before the min(1) check, like EmailSchema, so a name of only spaces
// is refused rather than stored blank. max(100) is on the raw string.
export const NameSchema = z
  .string()
  .max(100)
  .transform((v) => v.trim())
  .pipe(z.string().min(1, 'name is required'));

/** The top of the int `sort_order` column on slots and slot fields. */
export const MAX_SORT_ORDER = 2_147_483_647;

// Bounded by the column, so a value past it is invalid_input on sortOrder
// rather than an out-of-range error from Postgres.
export const SortOrderSchema = z.number().int().nonnegative().max(MAX_SORT_ORDER);

export const TagsSchema = z.array(z.string().min(1).max(40)).max(20).default([]);
