import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { signups } from './signups';
import { workspaces } from './workspaces';

export const slotFields = pgTable(
  'slot_fields',
  {
    id: text('id').primaryKey(),
    signupId: text('signup_id')
      .notNull()
      .references(() => signups.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    ref: text('ref').notNull(),
    label: text('label').notNull(),
    fieldType: text('field_type').notNull(), // text | date | time | number | enum
    required: boolean('required').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    config: jsonb('config').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    refUniquePerSignup: uniqueIndex('slot_fields_ref_unique').on(t.signupId, t.ref),
    bySignupSort: index('slot_fields_by_signup_sort').on(t.signupId, t.sortOrder),
  }),
);

export type SlotField = typeof slotFields.$inferSelect;
export type NewSlotField = typeof slotFields.$inferInsert;
