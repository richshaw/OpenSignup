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
    /**
     * Set when this participant opts out of reminder emails for this signup.
     * Participants rows are per-signup, so an opt-out is naturally scoped to
     * the signup they unsubscribed from and never silences another organizer.
     * Confirmations are unaffected: they acknowledge an action just taken.
     */
    remindersOptedOutAt: timestamp('reminders_opted_out_at', { withTimezone: true }),
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
