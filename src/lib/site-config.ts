/**
 * Public site-configuration constants for an OpenSignup instance.
 *
 * Read directly from `process.env.NEXT_PUBLIC_*` so values are inlined by
 * Next.js at build time and safe to import from statically prerendered pages.
 * Do NOT route these through `src/lib/env.ts` — that path parses server env
 * and is forbidden in static pages per CLAUDE.md.
 *
 * Required values are validated with Zod; an unset required var fails the
 * build loudly rather than silently shipping wrong copy on a self-hosted
 * deployment (e.g. an unintended governing-law jurisdiction in the terms).
 * Operators set these in their own `.env` before deploying.
 */
import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_INSTANCE_NAME: z.string().min(1, 'NEXT_PUBLIC_INSTANCE_NAME is required'),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.string().email('NEXT_PUBLIC_SUPPORT_EMAIL must be a valid email'),
  NEXT_PUBLIC_SOURCE_URL: z
    .string()
    .url('NEXT_PUBLIC_SOURCE_URL must be a valid URL')
    .refine((u) => u.startsWith('https://'), 'NEXT_PUBLIC_SOURCE_URL must use https'),
  NEXT_PUBLIC_GOVERNING_LAW: z.string().min(1, 'NEXT_PUBLIC_GOVERNING_LAW is required'),
  // Optional — when unset or blank, legal copy uses the generic "the operator
  // of this instance" fallback rather than fabricating a name. An empty
  // `NEXT_PUBLIC_OPERATOR_NAME=` line (common when copy-pasting `.env.example`)
  // normalises to undefined so it triggers the fallback, not a blank string.
  NEXT_PUBLIC_OPERATOR_NAME: z
    .string()
    .optional()
    .transform((v) => {
      const trimmed = v?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : undefined;
    }),
});

// Destructure into a literal object so the Next.js compiler can substitute the
// `process.env.NEXT_PUBLIC_*` reads with their string values at build time.
const parsed = schema.safeParse({
  NEXT_PUBLIC_INSTANCE_NAME: process.env.NEXT_PUBLIC_INSTANCE_NAME,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  NEXT_PUBLIC_SOURCE_URL: process.env.NEXT_PUBLIC_SOURCE_URL,
  NEXT_PUBLIC_GOVERNING_LAW: process.env.NEXT_PUBLIC_GOVERNING_LAW,
  NEXT_PUBLIC_OPERATOR_NAME: process.env.NEXT_PUBLIC_OPERATOR_NAME,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid site config:\n${issues}`);
}

export const INSTANCE_NAME = parsed.data.NEXT_PUBLIC_INSTANCE_NAME;
export const SUPPORT_EMAIL = parsed.data.NEXT_PUBLIC_SUPPORT_EMAIL;
export const SOURCE_URL = parsed.data.NEXT_PUBLIC_SOURCE_URL;
export const GOVERNING_LAW = parsed.data.NEXT_PUBLIC_GOVERNING_LAW;
export const OPERATOR_NAME = parsed.data.NEXT_PUBLIC_OPERATOR_NAME ?? null;

// Pre-built derivations so consumers don't hand-prefix `mailto:` or
// hand-strip the URL scheme — keeps that parsing concern in one place.
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}` as const;
export const SOURCE_DISPLAY = SOURCE_URL.replace(/^https:\/\//, '');

export function operatorLabel(): string {
  return OPERATOR_NAME ?? 'the operator of this instance';
}
