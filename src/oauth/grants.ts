import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type Provider from 'oidc-provider';
import { oauthRecords } from '@/db/schema/oauth';
import type { Db, Queryable } from '@/db/client';
import { recordActivity } from '@/lib/activity';
import { serviceError, ServiceException } from '@/lib/errors';
import { log } from '@/lib/log';
import { requireOrganizerId, type Actor } from '@/lib/policy';
import { parseScopeString, type Scope } from './scopes';
import { describeClient, type ClientDisplay } from './client-display';

/**
 * Reads and writes against Grant rows in `oauth_records`. A Grant is the
 * provider's record of "this organizer approved this client for these
 * scopes"; refresh tokens and codes hang off it by `grant_id`, which is what
 * makes revoking one grant revoke everything the client holds.
 */

const GRANT = 'Grant';

function liveGrant() {
  return and(
    eq(oauthRecords.model, GRANT),
    or(isNull(oauthRecords.expiresAt), gt(oauthRecords.expiresAt, sql`now()`)),
  );
}

/** The grant to extend when the same organizer re-approves the same client. */
export async function findGrantIdFor(
  db: Queryable,
  accountId: string,
  clientId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: oauthRecords.id })
    .from(oauthRecords)
    .where(and(liveGrant(), eq(oauthRecords.accountId, accountId), eq(oauthRecords.clientId, clientId)))
    .orderBy(desc(oauthRecords.createdAt))
    .limit(1);
  return row?.id;
}

export async function touchGrantUsed(db: Queryable, grantId: string): Promise<void> {
  await db
    .update(oauthRecords)
    .set({ lastUsedAt: sql`now()` })
    .where(and(eq(oauthRecords.model, GRANT), eq(oauthRecords.id, grantId)));
}

export interface EnsureGrantInput {
  accountId: string;
  clientId: string;
  clientName: string | null;
  resource: string;
  /** Scopes the request named at the OIDC level (openid, offline_access, …). */
  oidcScopes: string[];
  /** Scopes that reach the access token. */
  resourceScopes: string[];
}

/**
 * Find-or-create the one live grant for an organizer + client, then add the
 * approved scopes to it. Serialized per (organizer, client) with a
 * transaction-scoped advisory lock: two consent windows approving at once
 * would otherwise both see "no grant", create two, and disconnecting one
 * would leave the other's refresh tokens alive. The lock is what serializes;
 * the provider writes through its own connection, which is fine because
 * the second caller cannot look until the first has saved.
 */
export async function ensureGrant(db: Db, provider: Provider, input: EnsureGrantInput): Promise<{ grantId: string; extended: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`oauth-grant:${input.accountId}:${input.clientId}`}))`);
    const existingId = await findGrantIdFor(tx, input.accountId, input.clientId);
    const existing = existingId ? await provider.Grant.find(existingId) : undefined;
    const grant = existing ?? new provider.Grant({ accountId: input.accountId, clientId: input.clientId });
    if (input.oidcScopes.length > 0) grant.addOIDCScope(input.oidcScopes.join(' '));
    grant.addResourceScope(input.resource, input.resourceScopes.join(' '));
    const grantId = await grant.save();
    // The provider writes through its own connection, so the grant is
    // committed the moment save() returns; the label is cosmetic and must
    // not turn a successful approval into a failure. A retry extends the
    // same grant and labels it then.
    try {
      await labelGrant(tx, grantId, input.clientName);
    } catch (err) {
      log.warn({ err, grantId }, 'oauth: could not label grant');
    }
    return { grantId, extended: Boolean(existing) };
  });
}

/** Remember how the client introduced itself, for the connected-apps page. */
export async function labelGrant(db: Queryable, grantId: string, clientName: string | null): Promise<void> {
  await db
    .update(oauthRecords)
    .set({ clientName })
    .where(and(eq(oauthRecords.model, GRANT), eq(oauthRecords.id, grantId)));
}

export interface ConnectedApp {
  grantId: string;
  client: ClientDisplay;
  scopes: Scope[];
  approvedAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
}

export async function listConnectedApps(db: Queryable, actor: Actor): Promise<ConnectedApp[]> {
  const organizerId = requireOrganizerId(actor);
  const rows = await db
    .select()
    .from(oauthRecords)
    .where(and(liveGrant(), eq(oauthRecords.accountId, organizerId)))
    .orderBy(desc(oauthRecords.createdAt));
  return rows.map((row) => ({
    grantId: row.id,
    client: describeClient(row.clientId ?? '', row.clientName),
    scopes: scopesOfGrant(row.payload),
    approvedAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
  }));
}

/** Union of every resource scope in the grant payload. */
export function scopesOfGrant(payload: unknown): Scope[] {
  const resources = (payload as { resources?: Record<string, string> } | null)?.resources ?? {};
  const out: Scope[] = [];
  for (const scopeString of Object.values(resources)) {
    for (const s of parseScopeString(scopeString)) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Disconnect: destroy the grant and every code and refresh token issued
 * under it. Access tokens are JWTs and cannot be recalled; the caller's copy
 * tells the organizer so. Only the organizer who approved the grant may
 * revoke it.
 */
export async function revokeConnectedApp(
  db: Queryable,
  provider: Provider,
  actor: Actor,
  grantId: string,
): Promise<void> {
  const organizerId = requireOrganizerId(actor);
  const [row] = await db
    .select({ id: oauthRecords.id, clientId: oauthRecords.clientId, clientName: oauthRecords.clientName })
    .from(oauthRecords)
    .where(and(eq(oauthRecords.model, GRANT), eq(oauthRecords.id, grantId), eq(oauthRecords.accountId, organizerId)))
    .limit(1);
  if (!row) throw new ServiceException(serviceError('not_found', 'no such connected app'));

  await Promise.all([
    provider.AccessToken.revokeByGrantId(grantId),
    provider.RefreshToken.revokeByGrantId(grantId),
    provider.AuthorizationCode.revokeByGrantId(grantId),
    provider.Grant.adapter.destroy(grantId),
  ]);

  // Telemetry only, and the revocation above is already done: a failed
  // insert here must not report the disconnect as failed.
  try {
    await recordActivity(db, {
      signupId: null,
      workspaceId: null,
      actor: { actorId: organizerId, actorType: 'organizer' },
      eventType: 'oauth.grant_revoked',
      payload: { clientDomain: describeClient(row.clientId ?? '', row.clientName).domain },
    });
  } catch (err) {
    log.warn({ err }, 'recordActivity oauth.grant_revoked failed');
  }
}
