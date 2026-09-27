import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { oauthSigningKeys } from '@/db/schema/oauth';
import {
  loadOrCreateSigningKeys,
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
    await retireSigningKey(db, oldKid);
    const retired = await loadOrCreateSigningKeys(db);
    expect(retired.privateKeys.map((k) => k.kid)).toEqual([newKid]);
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
