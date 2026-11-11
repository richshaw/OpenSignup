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
    // NOTE: two more indexes exist on this table that are not declared here:
    // `activity_commitment_lookup` and `activity_told_lookup`, partial
    // expression indexes on (payload->>'commitmentId'). They are built with
    // CONCURRENTLY so they never block writes to this table, which rules out
    // both a drizzle migration and this schema. They live in
    // src/db/concurrent-indexes.ts and are applied by `pnpm db:migrate`.
    // `pnpm db:push` will not create them, and will drop them if they exist;
    // re-run `pnpm db:migrate` to get them back.
  }),
);

export const ACTIVITY_EVENTS = [
  'signup.created',
  'signup.updated',
  'signup.published',
  'signup.closed',
  'signup.reopened',
  'signup.archived',
  'signup.deleted',
  'signup.draft_started',
  'signup.editor_opened',
  'signup.previewed',
  'signup.viewed',
  'signup.publish_refused',
  'signup.link_copied',
  'signup.link_shared',
  'magic_compose.failed',
  'magic_compose.asked',
  'magic_compose.answered',
  'slot.created',
  'slot.updated',
  'slot.deleted',
  'slot.reordered',
  'slot.rescheduled',
  'slot.change_sent',
  'field.created',
  'field.updated',
  'field.reordered',
  'field.deleted',
  'participant.created',
  'commitment.created',
  'commitment.confirmation_sent',
  'commitment.updated',
  'commitment.cancelled',
  'commitment.removed',
  'commitment.swapped',
  'commitment.attempt_failed',
  'commitment.edit_link_followed',
  'reminder.sent',
  'reminder.opted_out',
  'reminder.opted_in',
  'auth.magic_link_sent',
  'auth.signed_in',
  'workspace.created',
  'oauth.consent_granted',
  'oauth.consent_denied',
  'oauth.grant_revoked',
  'landing.viewed',
  'landing.cta_clicked',
] as const;

export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number];
