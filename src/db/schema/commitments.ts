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
     * layer sums active commitment quantities against capacity instead.
     */
    position: integer('position').notNull(),
    status: text('status').notNull().default('confirmed'),
    // confirmed | tentative | waitlist | cancelled | no_show
    quantity: integer('quantity').notNull().default(1),
    notes: text('notes').notNull().default(''),
    notesVisibility: text('notes_visibility').notNull().default('public'), // public | organizer_only
    // Grandfathered: pre-existing exception to the no-speculative-schema rule (see CLAUDE.md).
    customFieldValues: jsonb('custom_field_values').notNull().default({}),
    paymentId: text('payment_id'),
    /** HMAC hash of the edit-token the participant uses to edit/cancel. */
    editTokenHash: text('edit_token_hash').notNull(),
    /**
     * The idempotency key sent with the sign-up that made this commitment, as
     * `idempotencyKeyHash` keeps it: an HMAC of the key and the rest of that
     * request. The same request sent again gets this commitment back rather
     * than a second one (`commitParticipantToSlot`). Null for a move, or a
     * sign-up sent without a key. Never the key itself: the key brings back
     * the edit link. No index: it is looked up within one slot's commitments,
     * under the slot's lock, which every sign-up to that slot takes first.
     */
    idempotencyKeyHash: text('idempotency_key_hash'),
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
