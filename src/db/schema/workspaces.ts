import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'personal' | 'team'
    plan: text('plan').notNull().default('free'),
    settings: jsonb('settings').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    typeIdx: index('workspaces_type_idx').on(t.type),
  }),
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
