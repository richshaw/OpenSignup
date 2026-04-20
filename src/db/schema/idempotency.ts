import { integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: text('id').primaryKey(),
    organizerId: text('organizer_id'), // null for participants
    participantScope: text('participant_scope'), // signupId for participants
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseBody: text('response_body').notNull(),
    responseStatus: integer('response_status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    uniqueOrg: uniqueIndex('idempotency_unique_org').on(t.organizerId, t.key),
    uniquePar: uniqueIndex('idempotency_unique_par').on(t.participantScope, t.key),
  }),
);

export const rateLimits = pgTable(
  'rate_limits',
  {
    bucket: text('bucket').notNull(),
    subject: text('subject').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => ({
    pk: uniqueIndex('rate_limits_pk').on(t.bucket, t.subject, t.windowStart),
  }),
);
