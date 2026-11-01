import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/client', () => ({ getDb: () => ({}) as unknown }));
// The session module drags in Auth.js, which does not load under vitest.
vi.mock('./organizer-session', () => ({ loadOrganizerSessionById: vi.fn(), toActor: vi.fn() }));

const ISSUER = 'https://signup.example.org';
const RESOURCE = `${ISSUER}/api/mcp`;

let signer: CryptoKey;
let publicJwk: Record<string, unknown>;
let rotatedSigner: CryptoKey;
let rotatedJwk: Record<string, unknown>;

async function mint(
  key: CryptoKey,
  kid: string,
  claims: Record<string, unknown>,
  opts: { typ?: string; exp?: string } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid, typ: opts.typ ?? 'at+jwt' })
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '10m')
    .sign(key);
}

beforeAll(async () => {
  const a = await generateKeyPair('ES256');
  signer = a.privateKey;
  publicJwk = { ...(await exportJWK(a.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
  const b = await generateKeyPair('ES256');
  rotatedSigner = b.privateKey;
  rotatedJwk = { ...(await exportJWK(b.publicKey)), kid: 'k2', alg: 'ES256', use: 'sig' };
});

describe('createVerifier', () => {
  it('accepts a token for our issuer and audience and maps the claims', async () => {
    const { createVerifier } = await import('./bearer');
    const v = createVerifier({
      issuer: ISSUER,
      resource: RESOURCE,
      loadKeys: async () => ({ keys: [publicJwk] }),
    });
    const token = await mint(signer, 'k1', {
      iss: ISSUER,
      aud: RESOURCE,
      sub: 'org_1',
      client_id: 'c',
      scope: 'signups:read signups:write',
    });
    const info = await v.verifyAccessToken(token);
    expect(info.clientId).toBe('c');
    expect(info.scopes).toEqual(['signups:read', 'signups:write']);
    expect(info.extra?.sub).toBe('org_1');
    expect(typeof info.expiresAt).toBe('number');
    expect(info.resource?.href).toBe(RESOURCE);
  });

  it.each([
    [
      'wrong audience',
      { iss: ISSUER, aud: `${ISSUER}/api/other`, sub: 'org_1', client_id: 'c' },
      {},
    ],
    [
      'wrong issuer',
      { iss: 'https://evil.example', aud: RESOURCE, sub: 'org_1', client_id: 'c' },
      {},
    ],
    ['missing sub', { iss: ISSUER, aud: RESOURCE, client_id: 'c' }, {}],
    ['wrong typ', { iss: ISSUER, aud: RESOURCE, sub: 'org_1', client_id: 'c' }, { typ: 'JWT' }],
    ['expired', { iss: ISSUER, aud: RESOURCE, sub: 'org_1', client_id: 'c' }, { exp: '-1h' }],
  ])(
    'rejects %s as an OAuth invalid_token error, never a raw jose error',
    async (_name, claims, opts) => {
      const { createVerifier } = await import('./bearer');
      const { OAuthError } = await import('@modelcontextprotocol/server');
      const v = createVerifier({
        issuer: ISSUER,
        resource: RESOURCE,
        loadKeys: async () => ({ keys: [publicJwk] }),
      });
      const token = await mint(signer, 'k1', claims, opts);
      await expect(v.verifyAccessToken(token)).rejects.toSatisfy(
        (e: unknown) =>
          OAuthError.isInstance(e) &&
          (e as InstanceType<typeof OAuthError>).code === 'invalid_token',
      );
    },
  );

  it('rejects a token signed by an unknown key', async () => {
    const { createVerifier } = await import('./bearer');
    const other = await generateKeyPair('ES256');
    const v = createVerifier({
      issuer: ISSUER,
      resource: RESOURCE,
      loadKeys: async () => ({ keys: [publicJwk] }),
    });
    const token = await mint(other.privateKey, 'k1', {
      iss: ISSUER,
      aud: RESOURCE,
      sub: 'org_1',
      client_id: 'c',
    });
    await expect(v.verifyAccessToken(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('reloads the key set once when it meets an unknown kid, so a rotated key is picked up', async () => {
    const { createVerifier } = await import('./bearer');
    let table = [publicJwk];
    const loadKeys = vi.fn(async () => ({ keys: table }));
    const v = createVerifier({ issuer: ISSUER, resource: RESOURCE, loadKeys });
    const old = await mint(signer, 'k1', {
      iss: ISSUER,
      aud: RESOURCE,
      sub: 'org_1',
      client_id: 'c',
    });
    await v.verifyAccessToken(old);
    expect(loadKeys).toHaveBeenCalledTimes(1);
    table = [rotatedJwk, publicJwk]; // another instance rotated
    const fresh = await mint(rotatedSigner, 'k2', {
      iss: ISSUER,
      aud: RESOURCE,
      sub: 'org_1',
      client_id: 'c',
    });
    await expect(v.verifyAccessToken(fresh)).resolves.toMatchObject({ clientId: 'c' });
    expect(loadKeys).toHaveBeenCalledTimes(2);
    // A genuinely unknown kid does not loop, and within the reload interval a
    // second unknown kid cannot flush the cache again (a forged token must not
    // be able to force a key-store read per request).
    const bogus = await mint((await generateKeyPair('ES256')).privateKey, 'k3', {
      iss: ISSUER,
      aud: RESOURCE,
      sub: 'org_1',
      client_id: 'c',
    });
    await expect(v.verifyAccessToken(bogus)).rejects.toMatchObject({ code: 'invalid_token' });
    expect(loadKeys).toHaveBeenCalledTimes(2);
  });

  it('shares one key read between requests that arrive together', async () => {
    const { createVerifier } = await import('./bearer');
    const loadKeys = vi.fn(async () => ({ keys: [publicJwk] }));
    const v = createVerifier({ issuer: ISSUER, resource: RESOURCE, loadKeys });
    const token = await mint(signer, 'k1', {
      iss: ISSUER,
      aud: RESOURCE,
      sub: 'org_1',
      client_id: 'c',
    });
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => v.verifyAccessToken(token)));
    expect(results.map((r) => r.clientId)).toEqual(['c', 'c', 'c', 'c', 'c']);
    expect(loadKeys).toHaveBeenCalledTimes(1);
  });
});

describe('createVerifier infrastructure failures', () => {
  it('reports a key-store outage as server_error, not invalid_token', async () => {
    const { createVerifier } = await import('./bearer');
    const v = createVerifier({
      issuer: ISSUER,
      resource: RESOURCE,
      loadKeys: async () => {
        throw new Error('db down');
      },
    });
    const token = await mint(signer, 'k1', {
      iss: ISSUER,
      aud: RESOURCE,
      sub: 'org_1',
      client_id: 'c',
    });
    await expect(v.verifyAccessToken(token)).rejects.toMatchObject({ code: 'server_error' });
  });

  it('keeps verifying with the cached keys when a timed re-read fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { createVerifier } = await import('./bearer');
      const { SIGNING_KEY_CACHE_MAX_AGE } = await import('@/oauth/config');
      let down = false;
      const loadKeys = vi.fn(async () => {
        if (down) throw new Error('db slow');
        return { keys: [publicJwk] };
      });
      const v = createVerifier({ issuer: ISSUER, resource: RESOURCE, loadKeys });
      const token = await mint(signer, 'k1', {
        iss: ISSUER,
        aud: RESOURCE,
        sub: 'org_1',
        client_id: 'c',
      });
      await v.verifyAccessToken(token);
      down = true;
      vi.setSystemTime(Date.now() + SIGNING_KEY_CACHE_MAX_AGE * 1000);
      await expect(v.verifyAccessToken(token)).resolves.toMatchObject({ clientId: 'c' });
      expect(loadKeys).toHaveBeenCalledTimes(2);
      // The failed read isn't retried on every request.
      await expect(v.verifyAccessToken(token)).resolves.toMatchObject({ clientId: 'c' });
      expect(loadKeys).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createVerifier timed re-read', () => {
  it('stops accepting a retired key once its copy of the keys is stale, with no restart', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { createVerifier } = await import('./bearer');
      const { SIGNING_KEY_CACHE_MAX_AGE } = await import('@/oauth/config');
      let keys = [rotatedJwk, publicJwk];
      const loadKeys = vi.fn(async () => ({ keys }));
      const v = createVerifier({ issuer: ISSUER, resource: RESOURCE, loadKeys });
      const old = await mint(
        signer,
        'k1',
        { iss: ISSUER, aud: RESOURCE, sub: 'org_1', client_id: 'c' },
        { exp: '1h' },
      );
      await expect(v.verifyAccessToken(old)).resolves.toMatchObject({ clientId: 'c' });

      keys = [rotatedJwk]; // k1 retired in the table
      vi.setSystemTime(Date.now() + SIGNING_KEY_CACHE_MAX_AGE * 1000 - 1000);
      await expect(v.verifyAccessToken(old)).resolves.toMatchObject({ clientId: 'c' });
      expect(loadKeys).toHaveBeenCalledTimes(1);

      // The request that finds the keys stale is served from them and starts
      // a re-read; the ones after it see the table's keys.
      vi.setSystemTime(Date.now() + 1000);
      await expect(v.verifyAccessToken(old)).resolves.toMatchObject({ clientId: 'c' });
      expect(loadKeys).toHaveBeenCalledTimes(2);
      await new Promise((r) => setTimeout(r, 0));
      await expect(v.verifyAccessToken(old)).rejects.toMatchObject({ code: 'invalid_token' });
      const fresh = await mint(rotatedSigner, 'k2', {
        iss: ISSUER,
        aud: RESOURCE,
        sub: 'org_1',
        client_id: 'c',
      });
      await expect(v.verifyAccessToken(fresh)).resolves.toMatchObject({ clientId: 'c' });
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't make a request wait on a re-read", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { createVerifier } = await import('./bearer');
      const { SIGNING_KEY_CACHE_MAX_AGE } = await import('@/oauth/config');
      let hang = false;
      const loadKeys = vi.fn(() =>
        hang ? new Promise<never>(() => {}) : Promise.resolve({ keys: [publicJwk] }),
      );
      const v = createVerifier({ issuer: ISSUER, resource: RESOURCE, loadKeys });
      const token = await mint(signer, 'k1', {
        iss: ISSUER,
        aud: RESOURCE,
        sub: 'org_1',
        client_id: 'c',
      });
      await v.verifyAccessToken(token);
      hang = true; // the database stops answering
      vi.setSystemTime(Date.now() + SIGNING_KEY_CACHE_MAX_AGE * 1000);
      await expect(v.verifyAccessToken(token)).resolves.toMatchObject({ clientId: 'c' });
      expect(loadKeys).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
