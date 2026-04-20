import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { participants } from './participants';
import { signups } from './signups';
import { slots } from './slots';
import { workspaces } from './workspaces';

export const commitments = pgTable(
  'commitments',
  {
    id: text('id').primaryKey(),
    slotId: text('slot_id')
      .notNull()
      .references(() => slots.id, { onDelete: 'cascade' }),
    signupId: text('signup_id')
      .notNull()
      .references(() => signups.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    participantId: text('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    /**
     * Monotonically-assigned slot position, starting at 1. The unique index on
     * (slot_id, position) is the database-level capacity enforcement.
     * Cancelled commitments keep their position (position is a write-time claim,
     * not a live slot), so cancellations don't reopen positions — the service
     * layer counts active commitments against capacity instead.
     */
    position: integer('position').notNull(),
    status: text('status').notNull().default('confirmed'),
    // confirmed | tentative | waitlist | cancelled | no_show | orphaned
    quantity: integer('quantity').notNull().default(1),
    notes: text('notes').notNull().default(''),
    notesVisibility: text('notes_visibility').notNull().default('public'), // public | organizer_only
    customFieldValues: jsonb('custom_field_values').notNull().default({}),
    paymentId: text('payment_id'),
    /** HMAC hash of the edit-token the participant uses to edit/cancel. */
    editTokenHash: text('edit_token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => ({
    slotPositionUnique: uniqueIndex('commitments_slot_position_unique').on(t.slotId, t.position),
    bySlotStatus: index('commitments_by_slot_status').on(t.slotId, t.status),
    bySignup: index('commitments_by_signup').on(t.signupId),
    byParticipant: index('commitments_by_participant').on(t.participantId),
    byWorkspace: index('commitments_by_workspace').on(t.workspaceId),
  }),
);

export type Commitment = typeof commitments.$inferSelect;
export type NewCommitment = typeof commitments.$inferInsert;
