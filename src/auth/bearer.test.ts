import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/client', () => ({ getDb: () => ({}) as unknown }));
// The session module drags in Auth.js, which does not load under vitest.
vi.mock('./organizer-session', () => ({ loadOrganizerSessionById: vi.fn(), toActor: vi.fn() }));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ AUTH_URL: 'https://signup.example.org', AUTH_SECRET: 'x'.repeat(32) }),
}));

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
    const v = createVerifier({ issuer: ISSUER, resource: RESOURCE, loadKeys: async () => ({ keys: [publicJwk] }), reload() {} });
    const token = await mint(signer, 'k1', { iss: ISSUER, aud: RESOURCE, sub: 'org_1', client_id: 'c', scope: 'signups:read signups:write' });
    const info = await v.verifyAccessToken(token);
    expect(info.clientId).toBe('c');
    expect(info.scopes).toEqual(['signups:read', 'signups:write']);
    expect(info.extra?.sub).toBe('org_1');
    expect(typeof info.expiresAt).toBe('number');
    expect(info.resource?.href).toBe(RESOURCE);
  });

  it.each([
    ['wrong audience', { iss: ISSUER, aud: `${ISSUER}/api/other`, sub: 'org_1', client_id: 'c' }, {}],
    ['wrong issuer', { iss: 'https://evil.example', aud: RESOURCE, sub: 'org_1', client_id: 'c' }, {}],
    ['missing sub', { iss: ISSUER, aud: RESOURCE, client_id: 'c' }, {}],
    ['wrong typ', { iss: ISSUER, aud: RESOURCE, sub: 'org_1', client_id: 'c' }, { typ: 'JWT' }],
    ['expired', { iss: ISSUER, aud: RESOURCE, sub: 'org_1', client_id: 'c' }, { exp: '-1h' }],
  ])('rejects %s as an OAuth invalid_token error, never a raw jose error', async (_name, claims, opts) => {
    const { createVerifier } = await import('./bearer');
    const { OAuthError } = await import('@modelcontextprotocol/server');
    const v = createVerifier({ issuer: ISSUER, resource: RESOURCE, loadKeys: async () => ({ keys: [publicJwk] }), reload() {} });
    const token = await mint(signer, 'k1', claims, opts);
    await expect(v.verifyAccessToken(token)).rejects.toSatisfy(
      (e: unknown) => OAuthError.isInstance(e) && (e as InstanceType<typeof OAuthError>).code === 'invalid_token',
    );
  });

  it('rejects a token signed by an unknown key', async () => {
    const { createVerifier } = await import('./bearer');
    const other = await generateKeyPair('ES256');
    const v = createVerifier({ issuer: ISSUER, resource: RESOURCE, loadKeys: async () => ({ keys: [publicJwk] }), reload() {} });
    const token = await mint(other.privateKey, 'k1', { iss: ISSUER, aud: RESOURCE, sub: 'org_1', client_id: 'c' });
    await expect(v.verifyAccessToken(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('reloads the key set once when it meets an unknown kid, so a rotated key is picked up', async () => {
    const { createVerifier } = await import('./bearer');
    let keys = [publicJwk];
    const reload = vi.fn(() => {
      keys = [rotatedJwk, publicJwk];
    });
    const loadKeys = vi.fn(async () => ({ keys }));
    const v = createVerifier({ issuer: ISSUER, resource: RESOURCE, loadKeys, reload });
    const old = await mint(signer, 'k1', { iss: ISSUER, aud: RESOURCE, sub: 'org_1', client_id: 'c' });
    await v.verifyAccessToken(old);
    const fresh = await mint(rotatedSigner, 'k2', { iss: ISSUER, aud: RESOURCE, sub: 'org_1', client_id: 'c' });
    await expect(v.verifyAccessToken(fresh)).resolves.toMatchObject({ clientId: 'c' });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(loadKeys).toHaveBeenCalledTimes(2);
    // A genuinely unknown kid does not loop, and within the reload interval a
    // second unknown kid cannot flush the cache again (a forged token must not
    // be able to force a key-store read per request).
    const bogus = await mint((await generateKeyPair('ES256')).privateKey, 'k3', { iss: ISSUER, aud: RESOURCE, sub: 'org_1', client_id: 'c' });
    await expect(v.verifyAccessToken(bogus)).rejects.toMatchObject({ code: 'invalid_token' });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(loadKeys).toHaveBeenCalledTimes(2);
  });
});

describe('createVerifier infrastructure failures', () => {
  it('reports a key-store outage as server_error, not invalid_token', async () => {
    const { createVerifier } = await import('./bearer');
    const v = createVerifier({ issuer: ISSUER, resource: RESOURCE, loadKeys: async () => { throw new Error('db down'); }, reload() {} });
    const token = await mint(signer, 'k1', { iss: ISSUER, aud: RESOURCE, sub: 'org_1', client_id: 'c' });
    await expect(v.verifyAccessToken(token)).rejects.toMatchObject({ code: 'server_error' });
  });
});

describe('insufficientScopeResponse', () => {
  it('is a 403 challenge naming the scope and the resource metadata', async () => {
    const { insufficientScopeResponse } = await import('./bearer');
    const r = insufficientScopeResponse(['commitments:read']);
    expect(r.status).toBe(403);
    const challenge = r.headers.get('www-authenticate') ?? '';
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('scope="commitments:read"');
    expect(challenge).toContain('resource_metadata="https://signup.example.org/.well-known/oauth-protected-resource/api/mcp"');
  });
});
