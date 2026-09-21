import { eq, sql } from 'drizzle-orm';
import type { Db, Queryable } from '@/db/client';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';

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

/**
 * Runs `service` while someone is part-way through signing up for `slotId`.
 * What `commitToSlot` does, held open: lock the slot, then insert a row whose
 * signup_id foreign key takes a key-share lock on the signup row. A service
 * that holds the signup `for update` and then needs that slot blocks the
 * insert while it waits for the slot, and Postgres breaks the cycle by failing
 * one of the two. See `lockSignupForWrite` in src/services/locks.ts.
 */
export async function whileSigningUp<T>(
  db: Db,
  at: { signupId: string; workspaceId: string; slotId: string },
  service: () => Promise<T>,
): Promise<T> {
  let running: Promise<T> | undefined;
  await db.transaction(async (tx) => {
    await tx.select().from(slots).where(eq(slots.id, at.slotId)).for('update');
    running = service();
    // Awaited below. Until then a failure here must not count as unhandled.
    running.catch(() => undefined);
    // The service now holds the signup lock and is queued behind the slot.
    await untilBlockedOn(db, tx);
    await recordActivity(tx, {
      signupId: at.signupId,
      workspaceId: at.workspaceId,
      actor: { actorId: null, actorType: 'system' },
      eventType: 'slot.updated',
    });
  });
  return running!;
}
