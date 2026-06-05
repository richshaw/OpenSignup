import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';
import { getEnv, type Env } from '@/lib/env';

type Provider = NextAuthConfig['providers'][number];

export interface OAuthProviderMeta {
  /** next-auth provider id, used in `signIn(id)` and the callback URL. */
  id: string;
  /** Human label for the sign-in button ("Continue with {label}"). */
  label: string;
}

interface OAuthProviderSpec extends OAuthProviderMeta {
  /** True only when every env var this provider needs is set (truthy). */
  isConfigured(env: Env): boolean;
  /** Build the next-auth provider instance from env. */
  create(env: Env): Provider;
}

/**
 * Registry of optional, env-gated OAuth providers. Each spec owns its own
 * config-check and construction (rather than assuming a universal id/secret
 * pair) so harder providers — GitHub (verified-email only), Apple (signed-JWT
 * secret) — can be added later as a single entry without reshaping this module,
 * `config.ts`, or the login UI.
 *
 * Enablement uses truthiness, not "defined": `.env.example` ships these as empty
 * strings and `z.string().optional()` keeps `''`. Mirrors `magicComposeEnabled`.
 */
const SPECS: readonly OAuthProviderSpec[] = [
  {
    id: 'google',
    label: 'Google',
    isConfigured: (env) => Boolean(env.GOOGLE_CLIENT_ID) && Boolean(env.GOOGLE_CLIENT_SECRET),
    create: (env) =>
      Google({
        clientId: env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
        // Safe here: Google verifies email ownership and owns the namespace, so
        // linking a Google login to an existing same-email organizer (created
        // via magic link) cannot be used to hijack an account.
        allowDangerousEmailAccountLinking: true,
      }),
  },
];

/** Pure: which OAuth providers have all their env fully configured. */
export function enabledOAuthProviders(env: Env): OAuthProviderMeta[] {
  return SPECS.filter((spec) => spec.isConfigured(env)).map(({ id, label }) => ({ id, label }));
}

/** Runtime convenience for server components (login page). */
export function getEnabledOAuthProviders(): OAuthProviderMeta[] {
  return enabledOAuthProviders(getEnv());
}

/** The next-auth `Provider[]` for every enabled OAuth provider; spread into config. */
export function buildOAuthProviders(): Provider[] {
  const env = getEnv();
  return SPECS.filter((spec) => spec.isConfigured(env)).map((spec) => spec.create(env));
}
