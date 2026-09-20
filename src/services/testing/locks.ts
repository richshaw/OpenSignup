import { sql } from 'drizzle-orm';
import type { Db, Queryable } from '@/db/client';

/**
 * Resolves once another backend is waiting on a lock `tx` holds. Call it from
 * inside the transaction that holds the lock, after starting the work that
 * should queue behind it. A fixed sleep here passes on a slow machine without
 * the two ever having met; this fails loudly instead. Asking Postgres who is
 * blocked by this backend, not who is waiting at all, keeps anything else
 * using the database out of the answer. The polling goes through `db`, a
 * connection of its own: inside a transaction pg_stat_activity is a snapshot
 * taken on first read, and would never show the waiter arriving.
 */
export async function untilBlockedOn(db: Db, tx: Queryable, timeoutMs = 10_000): Promise<void> {
  const [holder] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  if (!holder) throw new Error('could not read the backend pid');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [row] = await db.execute<{ waiting: number }>(sql`
      select count(*)::int as waiting
      from pg_stat_activity
      where wait_event_type = 'Lock'
        and ${holder.pid}::int = any(pg_blocking_pids(pid))
    `);
    if ((row?.waiting ?? 0) > 0) return;
    if (Date.now() > deadline) {
      throw new Error(`nothing queued behind backend ${holder.pid} within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
