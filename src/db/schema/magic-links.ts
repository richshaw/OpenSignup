import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const magicLinks = pgTable(
  'magic_links',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    email: text('email').notNull(),
    purpose: text('purpose').notNull(), // 'login_code' | 'claim'
    scopeId: text('scope_id'), // signup_id for claim, null for login
    /**
     * For `login_code`: the Auth.js callback URL the code redeems, encrypted
     * (AES-256-GCM, key derived from AUTH_SECRET). The URL carries the
     * single-use sign-in token, so it is never stored in the clear.
     */
    payloadEncrypted: text('payload_encrypted'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byEmail: index('magic_links_by_email').on(t.email),
  }),
);

export const signupClaims = pgTable('signup_claims', {
  id: text('id').primaryKey(),
  signupId: text('signup_id').notNull(),
  claimTokenHash: text('claim_token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  claimedById: text('claimed_by_id'),
});

export type MagicLink = typeof magicLinks.$inferSelect;
export type NewMagicLink = typeof magicLinks.$inferInsert;
