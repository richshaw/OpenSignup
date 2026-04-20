import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { signups } from './signups';
import { workspaces } from './workspaces';

export const slotGroups = pgTable(
  'slot_groups',
  {
    id: text('id').primaryKey(),
    signupId: text('signup_id')
      .notNull()
      .references(() => signups.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    ref: text('ref').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    displayStyle: text('display_style').notNull().default('list'), // list | grid | timeline | calendar
    selectionRule: text('selection_rule').notNull().default('none'), // none | one_of | any_of
    sortOrder: integer('sort_order').notNull().default(0),
    collapsedByDefault: boolean('collapsed_by_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    refUniquePerSignup: uniqueIndex('slot_groups_ref_unique').on(t.signupId, t.ref),
    bySignupSort: index('slot_groups_by_signup_sort').on(t.signupId, t.sortOrder),
  }),
);

export type SlotGroup = typeof slotGroups.$inferSelect;
export type NewSlotGroup = typeof slotGroups.$inferInsert;
