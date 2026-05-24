/**
 * Public site-configuration constants for an OpenSignup instance.
 *
 * These are read directly from `process.env.NEXT_PUBLIC_*` so they are inlined
 * by Next.js at build time and are safe to import from statically prerendered
 * pages (the legal pages, the landing page footer). Do NOT route these through
 * `src/lib/env.ts` — that path parses server env and is forbidden in static
 * pages per CLAUDE.md.
 *
 * Defaults point at the canonical opensignup.org deployment so the project
 * works out of the box; self-hosters override the env vars in their own
 * `.env` without forking source.
 */

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hello@opensignup.org';

export const SOURCE_URL =
  process.env.NEXT_PUBLIC_SOURCE_URL ?? 'https://github.com/richshaw/OpenSignup';

export const INSTANCE_NAME = process.env.NEXT_PUBLIC_INSTANCE_NAME ?? 'OpenSignup';

// Unset by default — fallback wording "the operator of this instance" is used
// in legal copy when there's no named operator.
export const OPERATOR_NAME = process.env.NEXT_PUBLIC_OPERATOR_NAME ?? null;

export const GOVERNING_LAW =
  process.env.NEXT_PUBLIC_GOVERNING_LAW ?? 'the State of Washington, United States';

export function operatorLabel(): string {
  return OPERATOR_NAME ?? 'the operator of this instance';
}
