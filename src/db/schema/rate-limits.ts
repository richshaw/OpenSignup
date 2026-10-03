import { integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

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
