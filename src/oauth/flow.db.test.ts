import { and, eq, like } from 'drizzle-orm';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { organizers } from '@/db/schema/organizers';
import { oauthRecords, oauthSigningKeys } from '@/db/schema/oauth';
import { workspaceMembers } from '@/db/schema/members';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { createVerifier } from '@/auth/bearer';
import { loadOrganizerSessionById, toActor } from '@/auth/organizer-session';
import { DrizzleOidcAdapter } from './adapter';
import { OAUTH_TTL } from './config';
import { ensureGrant, findGrantIdFor, labelGrant, listConnectedApps, revokeConnectedApp, touchGrantUsed } from './grants';
import { loadOrCreateSigningKeys } from './keys';
import { buildProvider } from './provider';
import {
  codeFromRedirect,
  createDriver,
  exchangeCode,
  finishInteraction,
  interactionDetails,
  pkcePair,
  refresh,
  resume,
  startAuthorization,
  type Driver,
} from './testing/flow-driver';

/**
 * The authorization code flow against real Postgres: the Drizzle adapter,
 * database-backed signing keys, grant listing/revocation, and the bearer
 * seam producing the same Actor the cookie path does.
 */

const ISSUER = 'https://signup.example.org';
const RESOURCE = `${ISSUER}/api/mcp`;
const CLIENT = 'https://client.example/oauth/metadata.json';
const REDIRECT = 'http://localhost/callback';

const db = getDb();
let d: Driver;
let organizerId: string;
let workspaceId: string;
let organizerActor: Actor;

const cimdDocument = {
  client_id: CLIENT,
  client_name: 'Example Assistant',
  redirect_uris: ['http://localhost/callback'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
};

beforeAll(async () => {
  await db.delete(oauthRecords);
  await db.delete(oauthSigningKeys);
  organizerId = makeId('org');
  workspaceId = makeId('ws');
  await db.insert(organizers).values({ id: organizerId, email: `${organizerId}@example.com`, defaultWorkspaceId: workspaceId });
  await db.insert(workspaces).values({ id: workspaceId, slug: organizerId.toLowerCase(), name: 'Flow', type: 'personal', plan: 'free' });
  await db.insert(workspaceMembers).values({ id: makeId('mem'), workspaceId, organizerId, role: 'owner', status: 'active' });
  organizerActor = toActor(await loadOrganizerSessionById(db, organizerId));

  const keys = await loadOrCreateSigningKeys(db);
  const provider = buildProvider({
    issuer: ISSUER,
    resource: RESOURCE,
    jwks: { keys: keys.privateKeys },
    cookieKeys: ['test'],
    adapter: DrizzleOidcAdapter,
    staticClients: [],
    organizerExists: async (id) => Boolean((await db.select({ id: organizers.id }).from(organizers).where(eq(organizers.id, id)))[0]),
    findGrantId: (a, c) => findGrantIdFor(db, a, c),
    allowCimdFetch: async () => true,
    onGrantUsed: (g) => touchGrantUsed(db, g),
    // Serve the CIMD document without a network.
    fetch: async (url) => {
      if (String(url) === CLIENT) {
        return new Response(JSON.stringify(cimdDocument), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    },
  });
  d = createDriver(provider, ISSUER);
});

afterAll(async () => {
  await db.delete(oauthRecords);
  await db.delete(oauthSigningKeys);
  await db.delete(activity).where(like(activity.eventType, 'oauth.%'));
  await db.delete(organizers).where(eq(organizers.id, organizerId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
});

async function approve(uid: string, scopes: string[]): Promise<string> {
  const details = await interactionDetails(d, uid);
  const clientId = String(details.params.client_id);
  const existing = await findGrantIdFor(db, organizerId, clientId);
  const grant = (existing && (await d.provider.Grant.find(existing))) || new d.provider.Grant({ accountId: organizerId, clientId });
  grant.addOIDCScope(scopes.join(' '));
  grant.addResourceScope(RESOURCE, scopes.filter((s) => s !== 'offline_access').join(' '));
  const grantId = await grant.save();
  await labelGrant(db, grantId, 'Example Assistant');
  const r = await finishInteraction(d, uid, { login: { accountId: organizerId }, consent: { grantId } });
  expect(r.status).toBe(303);
  return grantId;
}

describe('authorization code flow on Postgres', () => {
  it('identifies a CIMD client with no pre-registration and fetches its document once', async () => {
    const { verifier, challenge } = pkcePair();
    const first = await startAuthorization(d, { clientId: CLIENT, redirectUri: 'http://localhost:61000/callback', scope: 'signups:read signups:write', resource: RESOURCE, challenge });
    expect(first.response.status).toBe(303);
    expect(first.response.headers.get('location')).toMatch(/^\/oauth\/consent\//);

    const grantId = await approve(first.uid, ['signups:read', 'signups:write']);
    const { code } = codeFromRedirect(await resume(d, first.uid));
    const tokenRes = await exchangeCode(d, { clientId: CLIENT, redirectUri: 'http://localhost:61000/callback', code, verifier, resource: RESOURCE });
    expect(tokenRes.status, await tokenRes.clone().text()).toBe(200);
    const tokens = await tokenRes.json();
    expect(decodeJwt(tokens.access_token).sub).toBe(organizerId);

    // The bearer seam yields the same Actor the cookie path builds.
    const v = createVerifier({ issuer: ISSUER, resource: RESOURCE, loadKeys: async () => ({ keys: (await loadOrCreateSigningKeys(db)).publicKeys }), reload() {} });
    const info = await v.verifyAccessToken(tokens.access_token);
    const bearerActor = toActor(await loadOrganizerSessionById(db, String(info.extra?.sub)));
    expect(bearerActor).toEqual(organizerActor);
    expect(bearerActor.kind).toBe('organizer');

    // Grant bookkeeping.
    const apps = await listConnectedApps(db, organizerActor);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      grantId,
      client: { domain: 'client.example', name: 'Example Assistant', isUrl: true },
      scopes: ['signups:read', 'signups:write'],
    });
    expect(apps[0]!.lastUsedAt).toBeInstanceOf(Date);
    expect(apps[0]!.expiresAt!.getTime() - Date.now()).toBeGreaterThan((OAUTH_TTL.GRANT_MAX - 60) * 1000);

    // Re-approving extends the same grant rather than creating a second one.
    const second = await startAuthorization(d, { clientId: CLIENT, redirectUri: REDIRECT, scope: 'signups:read signups:write commitments:read', resource: RESOURCE, challenge: pkcePair().challenge });
    const sameGrant = await approve(second.uid, ['signups:read', 'signups:write', 'commitments:read']);
    expect(sameGrant).toBe(grantId);
    expect((await listConnectedApps(db, organizerActor))[0]?.scopes).toEqual(['signups:read', 'signups:write', 'commitments:read']);

    // The earlier refresh token does not gain the new scope.
    const r1 = await refresh(d, { clientId: CLIENT, refreshToken: tokens.refresh_token });
    expect(r1.status).toBe(200);
    expect(decodeJwt((await r1.json()).access_token).scope).toBe('signups:read signups:write');

    // Nobody else can see or revoke it.
    const stranger: Actor = { kind: 'organizer', id: makeId('org'), email: 'x@example.com', workspaceIds: [], workspaceRoles: {} };
    expect(await listConnectedApps(db, stranger)).toEqual([]);
    await expect(revokeConnectedApp(db, d.provider, stranger, grantId)).rejects.toMatchObject({ serviceError: { code: 'not_found' } });
    await expect(revokeConnectedApp(db, d.provider, { kind: 'anonymous' }, grantId)).rejects.toMatchObject({ serviceError: { code: 'unauthorized' } });

    // Disconnect: grant gone, refresh tokens gone, activity written.
    await revokeConnectedApp(db, d.provider, organizerActor, grantId);
    expect(await listConnectedApps(db, organizerActor)).toEqual([]);
    // Only the consumed Interaction (a 15-minute record) may still carry the grant id.
    const rows = await db.select({ model: oauthRecords.model }).from(oauthRecords).where(eq(oauthRecords.grantId, grantId));
    expect(rows.filter((r) => r.model !== 'Interaction')).toEqual([]);
    expect(await db.select({ id: oauthRecords.id }).from(oauthRecords).where(eq(oauthRecords.id, grantId))).toEqual([]);
    const events = await db.select({ e: activity.eventType }).from(activity).where(eq(activity.actorId, organizerId));
    expect(events.map((r) => r.e)).toContain('oauth.grant_revoked');
  });

  it('rejects a CIMD client whose document does not match its id', async () => {
    const { challenge } = pkcePair();
    const badId = 'https://client.example/other.json';
    const r = await startAuthorization(d, { clientId: badId, redirectUri: REDIRECT, scope: 'signups:read', challenge });
    expect(r.response.status).toBe(400);
    expect(await r.response.text()).toContain('invalid_client');
  });

  it('rejects a loopback client id outright, before any fetch', async () => {
    const { challenge } = pkcePair();
    const r = await startAuthorization(d, { clientId: 'https://localhost/metadata.json', redirectUri: REDIRECT, scope: 'signups:read', challenge });
    expect(r.response.status).toBe(400);
    expect(await r.response.text()).toContain('invalid_client');
  });
});

describe('ensureGrant', () => {
  it('serializes concurrent approvals so one organizer + client ends with exactly one grant', async () => {
    const clientId = 'https://racer.example/meta.json';
    const input = {
      accountId: organizerId,
      clientId,
      clientName: 'Racer',
      resource: RESOURCE,
      oidcScopes: [] as string[],
      resourceScopes: ['signups:read'],
    };
    const results = await Promise.all([
      ensureGrant(db, d.provider, input),
      ensureGrant(db, d.provider, { ...input, resourceScopes: ['signups:write'] }),
      ensureGrant(db, d.provider, input),
    ]);
    const ids = new Set(results.map((r) => r.grantId));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.extended)).toHaveLength(2);
    const rows = await db
      .select({ id: oauthRecords.id })
      .from(oauthRecords)
      .where(and(eq(oauthRecords.model, 'Grant'), eq(oauthRecords.clientId, clientId)));
    expect(rows).toHaveLength(1);
    const apps = await listConnectedApps(db, organizerActor);
    expect(apps.find((a) => a.client.domain === 'racer.example')?.scopes).toEqual(['signups:read', 'signups:write']);
    await revokeConnectedApp(db, d.provider, organizerActor, [...ids][0]!);
  });
});

