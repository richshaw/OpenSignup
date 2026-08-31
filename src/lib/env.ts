import { z } from 'zod';
import { requiredString } from './zod-env';

const transportEnum = z.enum(['console', 'smtp', 'resend']);

// Required vars use `requiredString` so they report the same tailored message
// whether the var was never provided or explicitly emptied — the latter reaches
// the schema as absent, because `withoutEmptyValues` strips it.
const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: requiredString('DATABASE_URL').min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: requiredString('AUTH_SECRET').min(32, 'AUTH_SECRET must be at least 32 characters'),
  AUTH_URL: requiredString('AUTH_URL').url('AUTH_URL must be a valid URL'),
  AUTH_MAGIC_LINK_MAX_AGE_MINUTES: z.coerce
    .number()
    .int()
    .min(1, 'AUTH_MAGIC_LINK_MAX_AGE_MINUTES must be at least 1')
    .max(10_080, 'AUTH_MAGIC_LINK_MAX_AGE_MINUTES must be at most 10080 (1 week)')
    .default(60),
  EMAIL_TRANSPORT: transportEnum.default('console'),
  EMAIL_FROM: requiredString('EMAIL_FROM').min(1, 'EMAIL_FROM is required'),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  SENTRY_DSN: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().max(600_000).default(180_000),
});

const conditional = baseSchema.superRefine((env, ctx) => {
  if (env.EMAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RESEND_API_KEY'],
      message: 'RESEND_API_KEY is required when EMAIL_TRANSPORT=resend',
    });
  }
  if (env.EMAIL_TRANSPORT === 'smtp') {
    for (const key of ['SMTP_HOST', 'SMTP_PORT'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when EMAIL_TRANSPORT=smtp`,
        });
      }
    }
  }
  if (Boolean(env.LLM_BASE_URL) !== Boolean(env.LLM_MODEL)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [env.LLM_BASE_URL ? 'LLM_MODEL' : 'LLM_BASE_URL'],
      message: 'LLM_BASE_URL and LLM_MODEL must be set together (or both unset)',
    });
  }
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [env.GOOGLE_CLIENT_ID ? 'GOOGLE_CLIENT_SECRET' : 'GOOGLE_CLIENT_ID'],
      message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together (or both unset)',
    });
  }
});

export type Env = z.infer<typeof baseSchema>;

/**
 * The `.default()` fields exempt from the rule below, for which `FOO=` still
 * means "unset".
 *
 * `.env.example` ships `LLM_TIMEOUT_MS=` bare, so the documented first-time
 * setup (`cp .env.example .env.local`) would otherwise fail on it. Unlike the
 * hazards named below, its default is not a development stand-in — it is simply
 * the value — so an operator who leaves it blank gets what the comment beside
 * it in `.env.example` promises.
 *
 * Add to this list only for a var whose default is safe in production; the
 * point of keeping it explicit is that a new `.default()` var has to be
 * considered rather than silently inheriting the exemption.
 */
const EMPTY_AS_UNSET_DEFAULTS: ReadonlySet<string> = new Set(['LLM_TIMEOUT_MS']);

/**
 * Whether `FOO=` should be read as "unset" rather than as the empty string.
 *
 * True for everything except `.default()`-backed vars. A default is what an
 * *absent* var means, and for several of these that default is a development
 * value: silently accepting `EMAIL_TRANSPORT=` in production routes every
 * magic-link and reminder email to the log with nobody able to sign in and no
 * error raised; `NEXT_PUBLIC_APP_URL=` puts localhost links in outgoing email;
 * `NODE_ENV=` makes src/email/console.ts log magic-link URLs with their tokens
 * intact. Those must stay loud boot failures rather than quiet fallbacks.
 *
 * Required vars carry no default, so stripping them changes no outcome — both
 * paths fail — but it does keep one message for a var whether it was emptied or
 * never set, instead of an emptied `AUTH_SECRET` reporting a length complaint.
 */
function emptyMeansUnset(key: string): boolean {
  const field = (baseSchema.shape as Record<string, z.ZodTypeAny | undefined>)[key];
  if (!(field instanceof z.ZodDefault)) return true;
  return EMPTY_AS_UNSET_DEFAULTS.has(key);
}

/**
 * Treat `FOO=` as unset, for the keys where that is the honest reading.
 *
 * `.env.example` ships most optional vars as a bare `FOO=` placeholder, and
 * dotenv loads those as `''`. Without this, the documented first-time setup
 * produces an env that fails validation on `LLM_BASE_URL: Invalid url` — an
 * empty string is not a URL, and `.optional()` only tolerates `undefined`.
 * Stripping those empties makes an unfilled placeholder mean what it looks like
 * it means, without extending the same courtesy to vars where an empty value
 * would quietly select a different behaviour.
 */
function withoutEmptyValues(
  raw: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(raw).filter(([key, value]) => !(value === '' && emptyMeansUnset(key))),
  );
}

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = conditional.safeParse(withoutEmptyValues(raw));
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

export function magicComposeEnabled(): boolean {
  const env = getEnv();
  return Boolean(env.LLM_BASE_URL && env.LLM_MODEL);
}
