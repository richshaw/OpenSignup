import type Provider from 'oidc-provider';
import { getDb } from '@/db/client';
import { eq } from 'drizzle-orm';
import { organizers } from '@/db/schema/organizers';
import { getEnv } from '@/lib/env';
import { ServiceException } from '@/lib/errors';
import { log } from '@/lib/log';
import { RateLimits, consumeRateLimit } from '@/lib/rate-limit';
import { DrizzleOidcAdapter } from './adapter';
import { mcpResourceUrl, oauthIssuer } from './config';
import { findGrantIdFor, touchGrantUsed } from './grants';
import { loadOrCreateSigningKeys, type SigningKeySet } from './keys';
import { buildProvider } from './provider';
import { parseStaticClients } from './static-clients';

/**
 * Process-wide singletons, cached on `globalThis` so `next dev`'s module
 * reloads do not build a second provider with its own CIMD cache and cookie
 * keys. Built lazily on first use: constructing the provider reads the
 * database (signing keys), which must never happen at import time or
 * `next build`'s page-data collection would need a live Postgres.
 */
declare global {
  var __signup_oidc_provider__: Promise<Provider> | undefined;
  var __signup_oidc_keys__: Promise<SigningKeySet> | undefined;
}

export function getSigningKeys(): Promise<SigningKeySet> {
  if (!globalThis.__signup_oidc_keys__) {
    globalThis.__signup_oidc_keys__ = loadOrCreateSigningKeys(getDb()).catch((err) => {
      globalThis.__signup_oidc_keys__ = undefined;
      throw err;
    });
  }
  return globalThis.__signup_oidc_keys__;
}

/** Drop the cached key set so the next verification re-reads the table. */
export function resetSigningKeysCache(): void {
  globalThis.__signup_oidc_keys__ = undefined;
}

export function getProvider(): Promise<Provider> {
  if (!globalThis.__signup_oidc_provider__) {
    globalThis.__signup_oidc_provider__ = build().catch((err) => {
      globalThis.__signup_oidc_provider__ = undefined;
      throw err;
    });
  }
  return globalThis.__signup_oidc_provider__;
}

async function build(): Promise<Provider> {
  const env = getEnv();
  const db = getDb();
  const keys = await getSigningKeys();
  const provider = buildProvider({
    issuer: oauthIssuer(),
    resource: mcpResourceUrl(),
    jwks: { keys: keys.privateKeys },
    cookieKeys: [env.AUTH_SECRET],
    adapter: DrizzleOidcAdapter,
    staticClients: parseStaticClients(env.OAUTH_STATIC_CLIENTS),
    organizerExists: async (id) => {
      const [row] = await db
        .select({ id: organizers.id })
        .from(organizers)
        .where(eq(organizers.id, id))
        .limit(1);
      return Boolean(row);
    },
    findGrantId: (accountId, clientId) => findGrantIdFor(db, accountId, clientId),
    allowCimdFetch: async (clientId) => {
      let origin: string;
      try {
        origin = new URL(clientId).origin;
      } catch {
        return false;
      }
      try {
        await consumeRateLimit(db, RateLimits.oauthCimdPerOrigin, origin);
        return true;
      } catch (err) {
        if (err instanceof ServiceException && err.serviceError.code === 'rate_limited') {
          log.warn({ origin }, 'oauth: CIMD fetch rate-limited');
          return false;
        }
        throw err;
      }
    },
    onGrantUsed: (grantId) => touchGrantUsed(db, grantId),
  });
  log.info({ issuer: oauthIssuer(), resource: mcpResourceUrl(), keys: keys.privateKeys.length }, 'oauth: provider ready');
  return provider;
}
