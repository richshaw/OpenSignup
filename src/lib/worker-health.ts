import { sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { QUEUES, REMINDER_DISPATCH_EVERY_MINUTES } from '@/jobs/queue-names';
import { log } from './log';

export type WorkerStatus = 'ok' | 'stale' | 'unknown';

/**
 * Three missed beats of the reminder dispatch cron means the worker process
 * is down or wedged.
 */
export const WORKER_STALE_AFTER_MS = 3 * REMINDER_DISPATCH_EVERY_MINUTES * 60 * 1000;

export function classifyWorkerStatus(
  lastCompletedAt: Date | null,
  now: Date,
): Exclude<WorkerStatus, 'unknown'> {
  if (!lastCompletedAt) return 'stale';
  return now.getTime() - lastCompletedAt.getTime() <= WORKER_STALE_AFTER_MS ? 'ok' : 'stale';
}

/**
 * Observes worker liveness from the web process with zero extra infra: the
 * dispatch cron leaves completed jobs in `pgboss.job`, so a recent completion
 * proves the worker is alive. Returns 'unknown' when the query fails for any
 * reason — most commonly the pgboss schema not existing yet (worker never
 * started against this database), but also permissions or transient DB errors.
 */
export async function getWorkerStatus(db: Db): Promise<WorkerStatus> {
  try {
    const rows = await db.execute<{ last: Date | string | null }>(
      sql`select max(completed_on) as last
          from pgboss.job
          where name = ${QUEUES.reminderDispatch} and state = 'completed'`,
    );
    const raw = rows[0]?.last ?? null;
    const last = raw === null ? null : new Date(raw);
    return classifyWorkerStatus(last, new Date());
  } catch (err) {
    log.warn({ err }, 'health: worker status query failed, reporting unknown');
    return 'unknown';
  }
}
