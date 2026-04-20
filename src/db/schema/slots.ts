import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { signups } from './signups';
import { slotGroups } from './slot-groups';
import { workspaces } from './workspaces';

export const slots = pgTable(
  'slots',
  {
    id: text('id').primaryKey(),
    signupId: text('signup_id')
      .notNull()
      .references(() => signups.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    groupId: text('group_id').references(() => slotGroups.id, { onDelete: 'set null' }),
    ref: text('ref').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    slotType: text('slot_type').notNull(), // time | item | role | date | quantity
    capacity: integer('capacity'), // null = unlimited
    sortOrder: integer('sort_order').notNull().default(0),
    location: text('location'),
    /**
     * Typed payload keyed by slot_type:
     *   date: { date: 'YYYY-MM-DD', startTime?, endTime? }
     *   time: { start: ISO, end: ISO }
     *   item: { unit?: string }
     *   role: { skills?: string[] }
     *   quantity: { unit?: string, target?: number }
     */
    typeData: jsonb('type_data').notNull().default({}),
    /** Reserved for v2 payments; kept on row for query simplicity. */
    priceCents: integer('price_cents'),
    status: text('status').notNull().default('open'), // open | closed
    /** Denormalized date for the 'date' slot type to enable index scans on reminders. */
    slotAt: timestamp('slot_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    refUniquePerSignup: uniqueIndex('slots_ref_unique').on(t.signupId, t.ref),
    bySignupSort: index('slots_by_signup_sort').on(t.signupId, t.sortOrder),
    byWorkspace: index('slots_by_workspace').on(t.workspaceId),
    byGroup: index('slots_by_group').on(t.groupId),
    bySlotAt: index('slots_by_slot_at').on(t.slotAt),
  }),
);

export type Slot = typeof slots.$inferSelect;
export type NewSlot = typeof slots.$inferInsert;
