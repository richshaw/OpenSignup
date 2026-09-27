import { desc, isNull, sql } from 'drizzle-orm';
import { exportJWK, generateKeyPair, calculateJwkThumbprint, type JWK } from 'jose';
import { oauthSigningKeys } from '@/db/schema/oauth';
import type { Db } from '@/db/client';
import { log } from '@/lib/log';
import { SIGNING_ALG } from './config';

export interface SigningKeySet {
  /** Private JWKs, newest first. The first one signs. */
  privateKeys: JWK[];
  /** Public halves of the same keys, same order. */
  publicKeys: JWK[];
}

// Arbitrary but fixed; only has to differ from other advisory locks we take.
const KEY_BOOTSTRAP_LOCK = 7_240_001;

/**
 * Load every active signing key, creating the first one if the table is
 * empty. Creation runs under a transaction-scoped advisory lock so two web
 * instances booting at once cannot each mint a different "first" key and
 * then disagree about which one signed a token.
 */
export async function loadOrCreateSigningKeys(db: Db): Promise<SigningKeySet> {
  let rows = await activeKeys(db);
  if (rows.length === 0) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${KEY_BOOTSTRAP_LOCK})`);
      const existing = await tx
        .select({ kid: oauthSigningKeys.kid })
        .from(oauthSigningKeys)
        .where(isNull(oauthSigningKeys.retiredAt))
        .limit(1);
      if (existing.length > 0) return;
      const jwk = await generatePrivateJwk();
      await tx.insert(oauthSigningKeys).values({ kid: jwk.kid!, alg: SIGNING_ALG, jwk });
      log.info({ kid: jwk.kid }, 'oauth: generated initial signing key');
    });
    rows = await activeKeys(db);
  }
  const privateKeys = rows.map((r) => r.jwk as JWK);
  return { privateKeys, publicKeys: privateKeys.map(publicJwk) };
}

/**
 * Add a fresh key at the front. Existing keys stay active so tokens they
 * signed remain verifiable; retire them with `retireSigningKey` once every
 * token that could carry their `kid` has expired (`OAUTH_TTL.ACCESS_TOKEN`).
 * The running provider only picks the new key up on restart.
 */
export async function rotateSigningKey(db: Db): Promise<string> {
  const jwk = await generatePrivateJwk();
  await db.insert(oauthSigningKeys).values({ kid: jwk.kid!, alg: SIGNING_ALG, jwk });
  return jwk.kid!;
}

export async function retireSigningKey(db: Db, kid: string): Promise<void> {
  await db
    .update(oauthSigningKeys)
    .set({ retiredAt: new Date() })
    .where(sql`${oauthSigningKeys.kid} = ${kid} and ${oauthSigningKeys.retiredAt} is null`);
}

async function activeKeys(db: Db) {
  return db
    .select({ kid: oauthSigningKeys.kid, jwk: oauthSigningKeys.jwk })
    .from(oauthSigningKeys)
    .where(isNull(oauthSigningKeys.retiredAt))
    .orderBy(desc(oauthSigningKeys.createdAt));
}

export async function generatePrivateJwk(): Promise<JWK> {
  const { privateKey } = await generateKeyPair(SIGNING_ALG, { extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.kid = await calculateJwkThumbprint(jwk);
  jwk.alg = SIGNING_ALG;
  jwk.use = 'sig';
  return jwk;
}

/** Strip the private members of an EC/RSA/OKP JWK. */
export function publicJwk(jwk: JWK): JWK {
  const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, oth: _oth, ...pub } = jwk;
  return pub;
}
