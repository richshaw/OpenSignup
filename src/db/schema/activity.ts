import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { signups } from './signups';
import { workspaces } from './workspaces';

export const activity = pgTable(
  'activity',
  {
    id: text('id').primaryKey(),
    signupId: text('signup_id').references(() => signups.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    actorId: text('actor_id'), // organizer id, participant id, or null for system
    actorType: text('actor_type').notNull(), // organizer | participant | system
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySignupOccurred: index('activity_by_signup_occurred').on(t.signupId, t.occurredAt),
    byWorkspaceOccurred: index('activity_by_workspace_occurred').on(t.workspaceId, t.occurredAt),
    byEvent: index('activity_by_event').on(t.eventType),
  }),
);

export const ACTIVITY_EVENTS = [
  'signup.created',
  'signup.updated',
  'signup.published',
  'signup.closed',
  'signup.archived',
  'signup.duplicated',
  'signup.deleted',
  'slot.created',
  'slot.updated',
  'slot.deleted',
  'field.created',
  'field.updated',
  'field.deleted',
  'participant.created',
  'commitment.created',
  'commitment.updated',
  'commitment.cancelled',
  'commitment.swapped',
  'commitment.orphaned',
  'reminder.scheduled',
  'reminder.sent',
  'reminder.failed',
] as const;

export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number];

export type Activity = typeof activity.$inferSelect;
export type NewActivity = typeof activity.$inferInsert;
