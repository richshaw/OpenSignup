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

export type SiteConfig = {
  INSTANCE_NAME: string;
  SUPPORT_EMAIL: string;
  SOURCE_URL: string;
  GOVERNING_LAW: string;
  OPERATOR_NAME: string | null;
};

/**
 * Pure schema validator — exported for tests. Mirrors `parseEnv` in env.ts so
 * the validation rules can be exercised without manipulating `process.env`.
 */
export function parseSiteConfig(
  raw: NodeJS.ProcessEnv | Record<string, string | undefined>,
): SiteConfig {
  const parsed = schema.safeParse({
    NEXT_PUBLIC_INSTANCE_NAME: raw.NEXT_PUBLIC_INSTANCE_NAME,
    NEXT_PUBLIC_SUPPORT_EMAIL: raw.NEXT_PUBLIC_SUPPORT_EMAIL,
    NEXT_PUBLIC_SOURCE_URL: raw.NEXT_PUBLIC_SOURCE_URL,
    NEXT_PUBLIC_GOVERNING_LAW: raw.NEXT_PUBLIC_GOVERNING_LAW,
    NEXT_PUBLIC_OPERATOR_NAME: raw.NEXT_PUBLIC_OPERATOR_NAME,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid site config:\n${issues}`);
  }
  return {
    INSTANCE_NAME: parsed.data.NEXT_PUBLIC_INSTANCE_NAME,
    SUPPORT_EMAIL: parsed.data.NEXT_PUBLIC_SUPPORT_EMAIL,
    SOURCE_URL: parsed.data.NEXT_PUBLIC_SOURCE_URL,
    GOVERNING_LAW: parsed.data.NEXT_PUBLIC_GOVERNING_LAW,
    OPERATOR_NAME: parsed.data.NEXT_PUBLIC_OPERATOR_NAME ?? null,
  };
}

// Reads the `process.env.NEXT_PUBLIC_*` keys literally so Next.js's compile-time
// substitution still kicks in — calling parseSiteConfig(process.env) would not.
const config = parseSiteConfig({
  NEXT_PUBLIC_INSTANCE_NAME: process.env.NEXT_PUBLIC_INSTANCE_NAME,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  NEXT_PUBLIC_SOURCE_URL: process.env.NEXT_PUBLIC_SOURCE_URL,
  NEXT_PUBLIC_GOVERNING_LAW: process.env.NEXT_PUBLIC_GOVERNING_LAW,
  NEXT_PUBLIC_OPERATOR_NAME: process.env.NEXT_PUBLIC_OPERATOR_NAME,
});

export const INSTANCE_NAME = config.INSTANCE_NAME;
export const SUPPORT_EMAIL = config.SUPPORT_EMAIL;
export const SOURCE_URL = config.SOURCE_URL;
export const GOVERNING_LAW = config.GOVERNING_LAW;
export const OPERATOR_NAME = config.OPERATOR_NAME;

// Pre-built derivations so consumers don't hand-prefix `mailto:` or
// hand-strip the URL scheme — keeps that parsing concern in one place.
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}` as const;
export const SOURCE_DISPLAY = SOURCE_URL.replace(/^https:\/\//, '');

export function operatorLabel(): string {
  return OPERATOR_NAME ?? 'the operator of this instance';
}
