import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizers } from './organizers';
import { workspaces } from './workspaces';

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    organizerId: text('organizer_id')
      .notNull()
      .references(() => organizers.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // owner | admin | editor | viewer
    status: text('status').notNull().default('active'), // active | invited | removed
    invitedById: text('invited_by_id').references(() => organizers.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueMember: uniqueIndex('workspace_members_unique').on(t.workspaceId, t.organizerId),
    byOrganizer: index('workspace_members_by_organizer').on(t.organizerId),
  }),
);

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;
