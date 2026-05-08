import { z } from 'zod';

export const IdSchema = z.string().regex(/^[a-z]+_[A-Za-z0-9]{22}$/, 'invalid id');

export function idOf<P extends string>(prefix: P) {
  const re = new RegExp(`^${prefix}_[A-Za-z0-9]{22}$`);
  return z.string().regex(re, `expected ${prefix} id`);
}

export const SlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab');

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

export const NameSchema = z.string().min(1).max(100).transform((v) => v.trim());

export const NotesSchema = z.string().max(500).optional().default('');

export const TagsSchema = z.array(z.string().min(1).max(40)).max(20).default([]);

export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

