import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type Provider from 'oidc-provider';
import { oauthRecords } from '@/db/schema/oauth';
import type { Queryable } from '@/db/client';
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
