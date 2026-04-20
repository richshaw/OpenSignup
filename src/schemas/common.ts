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

export const EmailSchema = z
  .string()
  .email()
  .max(254)
  .transform((v) => v.trim());

export const NameSchema = z.string().min(1).max(100).transform((v) => v.trim());

export const NotesSchema = z.string().max(500).optional().default('');

export const TagsSchema = z.array(z.string().min(1).max(40)).max(20).default([]);

export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
});

export const HateoasLinkSchema = z.object({
  href: z.string(),
  method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']).default('GET'),
  rel: z.string().optional(),
});

export type HateoasLink = z.infer<typeof HateoasLinkSchema>;

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    data,
    _links: z.record(z.string(), HateoasLinkSchema.or(z.string())).optional(),
    idempotencyKey: z.string().optional(),
  });
}
