/**
 * Zod helpers shared by the two env-parsing modules: `src/lib/env.ts` (server
 * env) and `src/lib/site-config.ts` (build-time `NEXT_PUBLIC_*`).
 *
 * They stay in their own module rather than one importing the other because
 * `site-config.ts` validates its required branding vars at module load — a
 * server-side import of it would make `env.ts` throw on any process that has
 * no branding vars set (the reminder worker, for one).
 */
import { z } from 'zod';

/**
 * A string that reports the same tailored message whether the var was never
 * provided or explicitly emptied.
 *
 * `required_error` fires when the key is absent; `invalid_type_error` when it
 * arrives as a non-string. Refinements like `.min(1)` / `.url()` only run once
 * a string is already present, so all three are needed to keep one var's
 * failure legible instead of a bare `Required`.
 */
export const requiredString = (name: string) =>
  z.string({
    required_error: `${name} is required`,
    invalid_type_error: `${name} is required`,
  });
