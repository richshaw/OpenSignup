import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { oauthSigningKeys } from '@/db/schema/oauth';
import { OAUTH_TTL } from './config';
import {
  RETIRE_AFTER_SECONDS,
  generatePrivateJwk,
  keyErrorSummary,
  listSigningKeys,
  loadOrCreateSigningKeys,
  markSigningKeyInUse,
  publicJwk,
  retireSigningKey,
  rotateSigningKey,
} from './keys';

const db = getDb();

describe('signing keys', () => {
  beforeAll(async () => {
    await db.delete(oauthSigningKeys);
  });
  afterAll(async () => {
    await db.delete(oauthSigningKeys);
  });

  it('creates one key on first load, even under concurrent bootstrap', async () => {
    const results = await Promise.all([
      loadOrCreateSigningKeys(db),
      loadOrCreateSigningKeys(db),
      loadOrCreateSigningKeys(db),
    ]);
    const kids = new Set(results.flatMap((r) => r.privateKeys.map((k) => k.kid)));
    expect(kids.size).toBe(1);
    const first = results[0]!;
    expect(first.privateKeys[0]).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256', use: 'sig' });
    expect(first.privateKeys[0]?.d).toBeDefined();
    expect(first.publicKeys[0]?.d).toBeUndefined();
    expect(first.publicKeys[0]?.kid).toBe(first.privateKeys[0]?.kid);
  });

  it('rotation puts the new key first and retirement drops it from the set', async () => {
    const before = await loadOrCreateSigningKeys(db);
    const oldKid = before.privateKeys[0]!.kid!;
    // created_at has millisecond resolution; make the ordering unambiguous.
    await new Promise((r) => setTimeout(r, 5));
    const newKid = await rotateSigningKey(db);
    const after = await loadOrCreateSigningKeys(db);
    expect(after.privateKeys.map((k) => k.kid)).toEqual([newKid, oldKid]);
    await signingFor(newKid, RETIRE_AFTER_SECONDS + 1);
    expect(await retireSigningKey(db, oldKid)).toBe('retired');
    const retired = await loadOrCreateSigningKeys(db);
    expect(retired.privateKeys.map((k) => k.kid)).toEqual([newKid]);
    expect(await retireSigningKey(db, oldKid)).toBe('unknown');
  });

  it('refuses to retire a key until a newer one has signed for an access token lifetime', async () => {
    const oldKid = await rotateSigningKey(db);
    await signingFor(oldKid, 3600);
    // The newest key: nothing has replaced it.
    expect(await retireSigningKey(db, oldKid)).toBe('in_use');

    await new Promise((r) => setTimeout(r, 5));
    const newKid = await rotateSigningKey(db);
    // Rotated, but no instance restarted onto the new key yet.
    expect(await retireSigningKey(db, oldKid)).toBe('in_use');

    await markSigningKeyInUse(db, newKid);
    // Restarted, but the old key's tokens may still be live.
    expect(await retireSigningKey(db, oldKid)).toBe('in_use');
    // A newer key can't be retired in favour of an older one.
    await signingFor(newKid, OAUTH_TTL.ACCESS_TOKEN - 60);
    expect(await retireSigningKey(db, newKid)).toBe('in_use');
    expect(await retireSigningKey(db, oldKid)).toBe('in_use');

    // A token signed just before the switch is still accepted for the
    // verifier's clock tolerance past its expiry.
    await signingFor(newKid, OAUTH_TTL.ACCESS_TOKEN + 1);
    expect(await retireSigningKey(db, oldKid)).toBe('in_use');

    await signingFor(newKid, RETIRE_AFTER_SECONDS + 1);
    expect(await retireSigningKey(db, newKid)).toBe('in_use');
    expect(await retireSigningKey(db, oldKid)).toBe('retired');
    expect((await listSigningKeys(db)).map((k) => k.kid)).not.toContain(oldKid);
  });

  it('retires a leaked key at once with force, but never the newest', async () => {
    const leaked = await rotateSigningKey(db);
    await new Promise((r) => setTimeout(r, 5));
    const newKid = await rotateSigningKey(db);
    // The new key hasn't signed anything yet.
    expect(await retireSigningKey(db, leaked)).toBe('in_use');
    expect(await retireSigningKey(db, newKid, { force: true })).toBe('in_use');
    expect(await retireSigningKey(db, leaked, { force: true })).toBe('retired');
    expect((await listSigningKeys(db)).map((k) => k.kid)).not.toContain(leaked);
  });

  it('describes a failed key insert without its private key', async () => {
    const jwk = await generatePrivateJwk();
    await db.insert(oauthSigningKeys).values({ kid: jwk.kid!, alg: 'ES256', jwk });
    const err = await db
      .insert(oauthSigningKeys)
      .values({ kid: jwk.kid!, alg: 'ES256', jwk })
      .catch((e: unknown) => e);
    // The raw error would print it.
    expect(String((err as Error).message)).toContain(jwk.d!);
    const summary = keyErrorSummary(err);
    expect(summary).toMatch(/duplicate key/);
    expect(summary).not.toContain(jwk.d!);
  });

  it('refuses a kid that is not an active key', async () => {
    expect(await retireSigningKey(db, 'no-such-kid')).toBe('unknown');
  });

  it('records when a key started signing once, and leaves it alone after', async () => {
    const kid = await rotateSigningKey(db);
    await markSigningKeyInUse(db, kid);
    const first = (await listSigningKeys(db)).find((k) => k.kid === kid)!.signingSince;
    expect(first).toBeInstanceOf(Date);
    await new Promise((r) => setTimeout(r, 5));
    await markSigningKeyInUse(db, kid);
    const second = (await listSigningKeys(db)).find((k) => k.kid === kid)!.signingSince;
    expect(second?.getTime()).toBe(first?.getTime());
  });

  it('publicJwk strips private members only', () => {
    expect(publicJwk({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'secret', kid: 'k' })).toEqual({
      kty: 'EC',
      crv: 'P-256',
      x: 'x',
      y: 'y',
      kid: 'k',
    });
  });
});

/** Pretend instances have been signing with `kid` for `seconds`. */
async function signingFor(kid: string, seconds: number): Promise<void> {
  await db
    .update(oauthSigningKeys)
    .set({ signingSince: sql`now() - make_interval(secs => ${seconds})` })
    .where(eq(oauthSigningKeys.kid, kid));
}
