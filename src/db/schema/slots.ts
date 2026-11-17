import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { signups } from './signups';
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
    ref: text('ref').notNull(),
    /** Map of field ref -> value, validated against signup's slot_fields. */
    values: jsonb('values').$type<Record<string, unknown>>().notNull().default({}),
    capacity: integer('capacity'), // null = unlimited
    sortOrder: integer('sort_order').notNull().default(0),
    // price_cents, reserved for payments that were never built, is out of this
    // schema but still in the database: the build serving during a deploy
    // selects it, so the migration that drops it comes a release later.
    status: text('status').notNull().default('open'), // open | closed
    /** Denormalized datetime derived from values + signup.settings.reminderFromFieldRef; null if no date field configured. */
    slotAt: timestamp('slot_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    refUniquePerSignup: uniqueIndex('slots_ref_unique').on(t.signupId, t.ref),
    bySignupSort: index('slots_by_signup_sort').on(t.signupId, t.sortOrder),
    byWorkspace: index('slots_by_workspace').on(t.workspaceId),
    bySlotAt: index('slots_by_slot_at').on(t.slotAt),
  }),
);

export type Slot = typeof slots.$inferSelect;
