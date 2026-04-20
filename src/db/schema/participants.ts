import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { signups } from './signups';
import { workspaces } from './workspaces';

export const participants = pgTable(
  'participants',
  {
    id: text('id').primaryKey(),
    signupId: text('signup_id')
      .notNull()
      .references(() => signups.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    email: text('email').notNull(),
    emailLower: text('email_lower').notNull(), // normalized for dedup
    name: text('name').notNull(),
    phone: text('phone'),
    sessionTokenHash: text('session_token_hash'), // for same-device UX (hashed)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueEmailPerSignup: uniqueIndex('participants_signup_email').on(t.signupId, t.emailLower),
    bySignup: index('participants_by_signup').on(t.signupId),
  }),
);

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
