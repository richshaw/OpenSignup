import { index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Storage for the OAuth 2.1 authorization server (`src/oauth/`).
 *
 * `oidc-provider` persists every model it owns — Session, Interaction, Grant,
 * AuthorizationCode, RefreshToken, ReplayDetection, … — through one adapter
 * interface keyed by (model name, id) with a JSON payload. One table with a
 * `model` discriminator mirrors that interface exactly, which keeps the
 * adapter a thin mapping rather than a per-model schema we would have to keep
 * in step with the library. Access tokens are JWTs and are never stored.
 *
 * The extracted columns exist for the lookups the adapter contract requires
 * (`findByUid`, `findByUserCode`, `revokeByGrantId`) plus the two our own UI
 * needs: `account_id` / `client_id` let the connected-apps page list an
 * organizer's grants without scanning JSON.
 */
export const oauthRecords = pgTable(
  'oauth_records',
  {
    model: text('model').notNull(),
    id: text('id').notNull(),
    payload: jsonb('payload').notNull(),
    grantId: text('grant_id'),
    uid: text('uid'),
    userCode: text('user_code'),
    accountId: text('account_id'),
    clientId: text('client_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Bumped on every successful token-endpoint use of a Grant. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.model, t.id] }),
    byGrant: index('oauth_records_by_grant').on(t.grantId),
    byUid: index('oauth_records_by_uid').on(t.uid),
    byUserCode: index('oauth_records_by_user_code').on(t.userCode),
    byAccount: index('oauth_records_by_account').on(t.model, t.accountId),
    byExpiry: index('oauth_records_by_expiry').on(t.expiresAt),
  }),
);

export type OauthRecord = typeof oauthRecords.$inferSelect;

/**
 * Signing keys for JWT access tokens. Generated on first use and shared by
 * every web instance through the database, so a token minted on one machine
 * verifies on another and a redeploy does not invalidate every connected
 * client. The newest non-retired key signs; all non-retired keys are
 * published in the JWKS so tokens signed by an older key stay verifiable
 * until they expire. `jwk` holds the private key — it never leaves the
 * server and is never logged.
 */
export const oauthSigningKeys = pgTable('oauth_signing_keys', {
  kid: text('kid').primaryKey(),
  alg: text('alg').notNull(),
  jwk: jsonb('jwk').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
});

export type OauthSigningKey = typeof oauthSigningKeys.$inferSelect;
