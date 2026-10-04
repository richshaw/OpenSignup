import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
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
    /**
     * Null when the participant gave no email. Such a participant gets no
     * confirmation or reminder emails.
     */
    email: text('email'),
    emailLower: text('email_lower'), // normalized for dedup; null exactly when email is
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
    // Postgres treats NULLs as distinct here, so any number of participants
    // without an email can share a signup.
    uniqueEmailPerSignup: uniqueIndex('participants_signup_email').on(t.signupId, t.emailLower),
    bySignup: index('participants_by_signup').on(t.signupId),
    // No email is both columns null; an email sets both, and neither blank.
    // `participantEmailColumns` below gives an insert the pair.
    emailLowerMatchesEmail: check(
      'participants_email_lower_with_email',
      sql`(${t.email} IS NULL AND ${t.emailLower} IS NULL) OR (${t.email} IS NOT NULL AND ${t.emailLower} IS NOT NULL AND ${t.email} <> '' AND ${t.emailLower} <> '')`,
    ),
  }),
);

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;

/**
 * The email columns for a new participant, which the check above keeps
 * together: both from the email as typed, or both null for no email. Typed so
 * an insert cannot set one without the other. Preserves the email's casing for
 * display; `emailLower` is what sign-ups are matched on.
 */
export function participantEmailColumns(
  email: string | null,
): { email: string; emailLower: string } | { email: null; emailLower: null } {
  return email === null
    ? { email: null, emailLower: null }
    : { email, emailLower: email.toLowerCase() };
}
