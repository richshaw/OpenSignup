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
  return pollUntilBlocked(db, tx, timeoutMs, () => undefined);
}

/**
 * `untilBlockedOn` for a service started inside the transaction that holds the
 * lock, and the way to wait for one: a service that returns or throws before
 * it blocks fails the test at once with what it did, instead of ten seconds
 * later with "nothing queued". It also takes over the rejection, so the caller
 * needs no `.catch` of its own and still sees the error when it awaits
 * `running` afterwards. A failure here is thrown at once, without waiting for
 * `running`: a service queued behind `tx` cannot settle until that transaction
 * ends, so waiting would hang until the test timed out and lose the real
 * error. The caller waits instead, once the transaction is over (`settle`).
 */
export async function untilServiceBlockedOn(
  db: Db,
  tx: Queryable,
  running: Promise<unknown>,
  timeoutMs = 10_000,
): Promise<void> {
  let finished: string | undefined;
  running.then(
    (value) => void (finished = `returned ${show(value)}`),
    (error: unknown) =>
      void (finished = `threw ${error instanceof Error ? error.message : String(error)}`),
  );
  await pollUntilBlocked(db, tx, timeoutMs, () => finished);
}

/** Never throws: a BigInt or a cycle in the value must not hide that it returned. */
function show(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Waits for a service started inside a lock holder's transaction, whatever
 * became of either. For `.finally(...)` on that transaction, so a test that
 * failed inside it does not leave the service writing into the next test. The
 * test still awaits `running` itself for the result, or the error.
 */
export async function settle(running: Promise<unknown> | undefined): Promise<void> {
  await running?.then(
    () => undefined,
    () => undefined,
  );
}

async function pollUntilBlocked(
  db: Db,
  tx: Queryable,
  timeoutMs: number,
  finished: () => string | undefined,
): Promise<void> {
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
    const outcome = finished();
    if (outcome !== undefined) {
      throw new Error(`the service finished before it blocked: ${outcome}`);
    }
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
  const held = db.transaction(async (tx) => {
    await tx.select().from(slots).where(eq(slots.id, at.slotId)).for('update');
    running = service();
    // The service now holds the signup lock and is queued behind the slot.
    await untilServiceBlockedOn(db, tx, running);
    await recordActivity(tx, {
      signupId: at.signupId,
      workspaceId: at.workspaceId,
      actor: { actorId: null, actorType: 'system' },
      eventType: 'slot.updated',
    });
  });
  await held.finally(() => settle(running));
  return running!;
}
