import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type PgBoss from 'pg-boss';
import { log } from '@/lib/log';

/**
 * One queue the worker runs. The worker's own are listed in `worker.ts`; a
 * site adds its own in a `*.jobs.ts` file in `src/jobs/extensions/` (see the
 * README there), so a repo that merges this one never edits a file of ours.
 */
export interface JobDefinition<Data extends object = object> {
  /**
   * The pg-boss queue. A site's own queues start with a prefix of its own,
   * such as `site.`, so they never meet one of OpenSignup's.
   */
  name: string;
  /**
   * A cron expression, in UTC, on which pg-boss queues a job. Without one, the
   * queue only runs jobs something sends it. The worker's schedules are exactly
   * those its jobs name when it starts: one no job names any more is removed.
   */
  schedule?: string;
  /**
   * Runs one job. A throw is logged and fails the job, which pg-boss then
   * tries again, twice, at once: so a job that must not run twice (one that
   * sends an email, say) records what it did before anything that can throw
   * after it, and checks that record first.
   */
  run(data: Data): Promise<unknown>;
  /** What a failure's log line says. Defaults to "<name> failed". */
  failureMessage?: string;
  /** Fields of the job's data that a failure's log line names, such as an id. Never anything personal. */
  logFields?(data: Data): Record<string, unknown>;
}

/** The part of pg-boss the registry uses, so tests can pass a fake. */
export type JobBoss = Pick<
  PgBoss,
  'createQueue' | 'schedule' | 'work' | 'getSchedules' | 'unschedule'
>;

/**
 * Creates each job's queue and schedule, then starts working each queue. All
 * the queues and schedules come first, so a bad cron expression in one job
 * fails before any of them is worked.
 */
export async function registerJobs(boss: JobBoss, jobs: readonly JobDefinition[]): Promise<void> {
  for (const job of jobs) {
    await boss.createQueue(job.name);
    if (job.schedule) await boss.schedule(job.name, job.schedule);
  }
  for (const job of jobs) {
    await boss.work<object>(job.name, async (batch) => {
      for (const { data } of batch) {
        try {
          await job.run(data);
        } catch (err) {
          log.error(
            { err, queue: job.name, ...job.logFields?.(data) },
            job.failureMessage ?? `${job.name} failed`,
          );
          throw err;
        }
      }
    });
  }
}

/** Where a site's own jobs live. Relative to the working directory, as the worker runs from the repo root. */
export const EXTENSIONS_DIR = path.resolve('src/jobs/extensions');

/** A file in the extensions folder that holds jobs. Anything else there (helpers, tests, the README) is left alone. */
const EXTENSION_FILE = /\.jobs\.ts$/;

interface Extension {
  file: string;
  jobs: JobDefinition[];
}

function isJobDefinition(value: unknown): value is JobDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const job = value as Record<string, unknown>;
  return (
    typeof job.name === 'string' &&
    job.name.length > 0 &&
    typeof job.run === 'function' &&
    (job.schedule === undefined || typeof job.schedule === 'string')
  );
}

/** The jobs a module exports, or a reason it can't be used. */
function jobsOf(mod: unknown): JobDefinition[] | string {
  const exported = mod as { jobs?: unknown; default?: { jobs?: unknown } };
  const jobs = exported.jobs ?? exported.default?.jobs;
  if (!Array.isArray(jobs)) return 'it exports no `jobs` array';
  if (!jobs.every(isJobDefinition)) return 'one of its `jobs` has no name or no run function';
  return jobs;
}

/**
 * Imports every `*.jobs.ts` file in `dir`, in name order. A file that throws
 * on import, or exports no usable `jobs`, is logged and left out, so one
 * broken file never stops the others or the worker's own jobs. A missing
 * folder means no extensions.
 */
export async function loadExtensions(dir: string = EXTENSIONS_DIR): Promise<Extension[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((name) => EXTENSION_FILE.test(name)).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const extensions: Extension[] = [];
  for (const file of files) {
    try {
      const jobs = jobsOf(await import(pathToFileURL(path.join(dir, file)).href));
      if (typeof jobs === 'string') {
        log.error({ file }, `worker extension skipped: ${jobs}`);
        continue;
      }
      extensions.push({ file, jobs });
    } catch (err) {
      log.error({ err, file }, 'worker extension skipped: it failed to load');
    }
  }
  return extensions;
}

/** pg-boss's own queues start with this; their schedules are never ours to remove. */
const PGBOSS_INTERNAL = '__pgboss__';

/** Removes every schedule whose queue isn't in `keep`: one a job used to name, or one a skipped extension named. */
export async function unscheduleOthers(boss: JobBoss, keep: ReadonlySet<string>): Promise<void> {
  for (const { name } of await boss.getSchedules()) {
    if (keep.has(name) || name.startsWith(PGBOSS_INTERNAL)) continue;
    await boss.unschedule(name);
    log.info({ queue: name }, 'removed a schedule no job names');
  }
}

/**
 * Registers the worker's own jobs, then each extension's. A failure among the
 * worker's own jobs throws, and stops the worker as before. An extension that
 * fails, or names a queue already taken, is logged and skipped, and its
 * schedules are removed with any other stale one.
 */
export async function startJobs(
  boss: JobBoss,
  builtIn: readonly JobDefinition[],
  extensionsDir: string = EXTENSIONS_DIR,
): Promise<{ queues: string[] }> {
  const queues = new Set<string>();
  const scheduled = new Set<string>();
  const taken = (jobs: readonly JobDefinition[]) =>
    jobs.find((job, i) => queues.has(job.name) || jobs.findIndex((j) => j.name === job.name) !== i)
      ?.name;
  const add = (jobs: readonly JobDefinition[]) => {
    for (const job of jobs) {
      queues.add(job.name);
      if (job.schedule) scheduled.add(job.name);
    }
  };

  const clash = taken(builtIn);
  if (clash) throw new Error(`two of the worker's own jobs use the queue ${clash}`);
  await registerJobs(boss, builtIn);
  add(builtIn);

  for (const { file, jobs } of await loadExtensions(extensionsDir)) {
    const name = taken(jobs);
    if (name) {
      log.error({ file, queue: name }, 'worker extension skipped: its queue name is taken');
      continue;
    }
    try {
      await registerJobs(boss, jobs);
      add(jobs);
      log.info({ file, queues: jobs.map((job) => job.name) }, 'worker extension loaded');
    } catch (err) {
      log.error({ err, file }, 'worker extension skipped: it failed to register');
    }
  }

  await unscheduleOthers(boss, scheduled);
  return { queues: [...queues] };
}
