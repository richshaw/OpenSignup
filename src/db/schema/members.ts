import { index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
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
    // invited_by_id and joined_at were never read (joined_at only got its
    // default). They're out of this schema but still in the database: the build
    // serving during a deploy selects them, so the migration that drops them
    // comes a release later.
  },
  (t) => ({
    uniqueMember: uniqueIndex('workspace_members_unique').on(t.workspaceId, t.organizerId),
    byOrganizer: index('workspace_members_by_organizer').on(t.organizerId),
  }),
);
