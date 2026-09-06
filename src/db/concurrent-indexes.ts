/**
 * Indexes created outside the migration transaction, with `CONCURRENTLY`.
 *
 * A plain `CREATE INDEX` takes a SHARE lock for the duration of the build,
 * blocking every INSERT into the table. For `activity` that means participant
 * commits, page views and telemetry all stall while the index builds — on the
 * very table whose row count grows with the lifetime volume of the site. So
 * these cannot be ordinary drizzle migrations: `CREATE INDEX CONCURRENTLY`
 * refuses to run inside a transaction block, and drizzle's migrator wraps
 * migrations in one.
 *
 * `pnpm db:migrate` applies them after the migrations, so the documented setup
 * path still ends with a correct schema. They are pure performance — nothing
 * reads them for correctness — so a deployment that has not run them yet is
 * slow, never wrong.
 */
import type { Sql } from 'postgres';

export interface ConcurrentIndex {
  name: string;
  /** Must be `CREATE INDEX CONCURRENTLY IF NOT EXISTS` so re-running is a no-op. */
  create: string;
}

export const CONCURRENT_INDEXES: ConcurrentIndex[] = [
  {
    name: 'activity_commitment_lookup',
    // Hot paths look up activity rows by the commitmentId inside `payload`: the
    // reminder dispatcher's NOT EXISTS and the send-time guard. Without an
    // expression index Postgres scans every row of the matching event_type to
    // prove a miss. The dispatcher scans the whole reminder lead window rather
    // than a two-hour slice, which makes that scan both wider and unavoidable.
    //
    // Partial, because these are the only event types ever queried this way.
    create: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "activity_commitment_lookup"
      ON "activity" (("payload"->>'commitmentId'))
      WHERE "event_type" IN ('reminder.sent', 'commitment.confirmation_sent')`,
  },
];

/**
 * Creates any missing concurrent index, and rebuilds any left invalid.
 *
 * A `CREATE INDEX CONCURRENTLY` that fails partway leaves an *invalid* index
 * behind: it still occupies the name, so `IF NOT EXISTS` skips it forever, and
 * the planner never uses it. Dropping it first turns a one-off failure into
 * something the next `pnpm db:migrate` repairs on its own.
 */
export async function applyConcurrentIndexes(
  sql: Sql,
  log: (message: string) => void = () => {},
): Promise<void> {
  for (const index of CONCURRENT_INDEXES) {
    const invalid = await sql`
      SELECT 1 FROM pg_class c
      JOIN pg_index i ON i.indexrelid = c.oid
      WHERE c.relname = ${index.name} AND NOT i.indisvalid
      LIMIT 1
    `;
    if (invalid.length > 0) {
      log(`dropping invalid index ${index.name}`);
      await sql.unsafe(`DROP INDEX CONCURRENTLY IF EXISTS "${index.name}"`);
    }
    await sql.unsafe(index.create);
  }
}
