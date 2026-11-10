import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { StoredSignupSettings } from '@/schemas/signups';
import { organizers } from './organizers';
import { workspaces } from './workspaces';

export const signups = pgTable(
  'signups',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    organizerId: text('organizer_id')
      .notNull()
      .references(() => organizers.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('draft'), // draft | open | closed | archived
    visibility: text('visibility').notNull().default('unlisted'), // public | unlisted | password
    theme: jsonb('theme').notNull().default({}),
    opensAt: timestamp('opens_at', { withTimezone: true }),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    // claim_token_hash, for a signup-claim link that was never built, is out of
    // this schema but still in the database: the build serving during a deploy
    // selects it, so the migration that drops it comes a release later.
    tags: text('tags').array().notNull().default([]),
    settings: jsonb('settings').$type<StoredSignupSettings>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    slugUnique: uniqueIndex('signups_slug_unique').on(t.slug),
    byWorkspaceCreated: index('signups_by_workspace_created').on(t.workspaceId, t.createdAt),
    byOrganizer: index('signups_by_organizer').on(t.organizerId),
    byStatus: index('signups_by_status').on(t.status),
  }),
);

export type Signup = typeof signups.$inferSelect;
