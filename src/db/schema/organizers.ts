import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Organizers are the user table. Column names match Auth.js DefaultSchema
 * conventions (`name`, `emailVerified`, `image`) so the Drizzle adapter
 * can use this table directly. Our extra columns coexist without affecting
 * the adapter.
 */
export const organizers = pgTable(
  'organizers',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    email: text('email').notNull().unique(),
    emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
    image: text('image'),
    // signup-specific
    defaultWorkspaceId: text('default_workspace_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index('organizers_email_idx').on(t.email),
  }),
);

export type Organizer = typeof organizers.$inferSelect;
export type NewOrganizer = typeof organizers.$inferInsert;
