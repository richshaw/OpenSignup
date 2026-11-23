import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type PgBoss from 'pg-boss';
import { log } from '@/lib/log';

/**
 * One queue the worker runs. The worker's own are listed in `built-in.ts`; a
 * site adds its own in a `*.jobs.ts` file in `src/jobs/extensions/` (see the
 * README there), so a repo that merges this one never edits a file of ours.
 */
export interface JobDefinition<Data extends object = object> {
  /**
   * The pg-boss queue. A site's own queues start with a prefix of its own,
   * such as `site.`, so they never meet one of OpenSignup's. Names starting
   * `__pgboss__` are pg-boss's own, and refused.
   */
  name: string;
  /**
   * A cron expression, in UTC, on which pg-boss queues a job. Without one, the
   * queue only runs jobs something sends it. The worker's schedules are exactly
   * those its jobs name when it starts: one no job names any more is removed.
   */
  schedule?: string;
  /**
   * Runs one job, with the data it was sent; a job queued by its schedule
   * gets `{}`. A throw is logged and fails the job, which pg-boss then tries
   * again, twice, at once, as it does a job still running after 15 minutes:
   * so a job that must not run twice (one that sends an email, say) records
   * what it did before anything that can throw after it, and checks that
   * record first.
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
  'createQueue' | 'schedule' | 'work' | 'offWork' | 'getSchedules' | 'unschedule'
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
  const working: string[] = [];
  try {
    for (const job of jobs) {
      await workQueue(boss, job);
      working.push(job.name);
    }
  } catch (err) {
    // Stop the queues this call already started, so none of a skipped file's
    // queues is left worked without being marked taken.
    for (const name of working) {
      await boss.offWork(name).catch((offWorkErr: unknown) => {
        log.error(
          { err: offWorkErr, queue: name },
          'could not stop a queue after a failed registration',
        );
      });
    }
    throw err;
  }
}

/** Starts working one job's queue, logging each failure before pg-boss retries it. */
async function workQueue(boss: JobBoss, job: JobDefinition): Promise<void> {
  await boss.work<object | null>(job.name, async (batch) => {
    for (const { data } of batch) {
      // pg-boss gives a job queued by a schedule no data at all.
      const payload = data ?? {};
      try {
        await job.run(payload);
      } catch (err) {
        log.error(
          { ...failureFields(job, payload), err, queue: job.name },
          job.failureMessage ?? `${job.name} failed`,
        );
        throw err;
      }
    }
  });
}

/** A job's `logFields`, or none if they throw, so the failure being logged is never lost. */
function failureFields(job: JobDefinition, data: object): Record<string, unknown> {
  try {
    return job.logFields?.(data) ?? {};
  } catch {
    return {};
  }
}

/** Where a site's own jobs live: beside this file, wherever the worker is started from. */
export const EXTENSIONS_DIR = path.join(__dirname, 'extensions');

/** A file in the extensions folder that holds jobs. Anything else there (helpers, tests, the README) is left alone. */
const EXTENSION_FILE = /\.jobs\.ts$/;

interface Extension {
  file: string;
  jobs: JobDefinition[];
}

function isJobDefinition(value: unknown): value is JobDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const job = value as Record<string, unknown>;
  // An empty schedule, or one of only spaces, would quietly mean none or fail
  // later at pg-boss, so it's refused here, as is a
  // failure message or log-fields function of the wrong kind.
  return (
    typeof job.name === 'string' &&
    job.name.length > 0 &&
    typeof job.run === 'function' &&
    (job.schedule === undefined ||
      (typeof job.schedule === 'string' && job.schedule.trim() !== '')) &&
    (job.failureMessage === undefined || typeof job.failureMessage === 'string') &&
    (job.logFields === undefined || typeof job.logFields === 'function')
  );
}

/** The jobs a module exports, or a reason it can't be used. */
function jobsOf(mod: unknown): JobDefinition[] | string {
  const exported = mod as { jobs?: unknown; default?: { jobs?: unknown } };
  const jobs = exported.jobs ?? exported.default?.jobs;
  if (!Array.isArray(jobs)) return 'it exports no `jobs` array';
  if (!jobs.every(isJobDefinition)) return 'one of its `jobs` is not a valid job definition';
  return jobs;
}

/**
 * Imports every `*.jobs.ts` file in `dir`, in name order. A file that throws
 * on import, or exports no usable `jobs`, is logged and left out, so one
 * broken file never stops the others or the worker's own jobs. Null when the
 * folder can't be listed: OpenSignup ships it, so that's a broken install,
 * and the caller mustn't take it to mean "no extensions".
 */
export async function loadExtensions(dir: string = EXTENSIONS_DIR): Promise<Extension[] | null> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((name) => EXTENSION_FILE.test(name)).sort();
  } catch (err) {
    log.error({ err, dir }, 'worker extensions skipped: the folder could not be listed');
    return null;
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

/**
 * pg-boss's own queues start with this. A job may not take one (a second
 * worker on `__pgboss__send-it` would swallow every schedule), and their
 * schedules, should a pg-boss version keep any (10 keeps none), aren't ours
 * to remove.
 */
const PGBOSS_INTERNAL = '__pgboss__';

/**
 * Removes every schedule whose queue isn't in `keep`: one a job used to name,
 * or one a skipped extension named. The worker owns the whole schedule table:
 * a schedule made any other way is removed too.
 */
export async function unscheduleOthers(boss: JobBoss, keep: ReadonlySet<string>): Promise<void> {
  for (const { name } of await boss.getSchedules()) {
    if (keep.has(name) || name.startsWith(PGBOSS_INTERNAL)) continue;
    await boss.unschedule(name);
    log.warn({ queue: name }, 'removed a schedule no job names');
  }
}

/**
 * Registers the worker's own jobs, then each extension's. A failure among the
 * worker's own jobs throws, and stops the worker as before. An extension that
 * fails, or names a queue already taken or reserved, is logged and skipped,
 * and its schedules are removed with any other stale one. If the extensions
 * folder can't be listed, no schedule is removed, since there's no telling
 * which are stale.
 */
export async function startJobs(
  boss: JobBoss,
  builtIn: readonly JobDefinition[],
  extensionsDir: string = EXTENSIONS_DIR,
): Promise<{ queues: string[] }> {
  const queues = new Set<string>();
  const scheduled = new Set<string>();
  const taken = (jobs: readonly JobDefinition[]) =>
    jobs.find(
      (job, i) =>
        queues.has(job.name) ||
        job.name.startsWith(PGBOSS_INTERNAL) ||
        jobs.findIndex((j) => j.name === job.name) !== i,
    )?.name;
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

  const extensions = await loadExtensions(extensionsDir);
  for (const { file, jobs } of extensions ?? []) {
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

  if (extensions) {
    // Removing stale schedules is housekeeping: if it fails, log it and run
    // the jobs anyway. The next start tries again.
    try {
      await unscheduleOthers(boss, scheduled);
    } catch (err) {
      log.error({ err }, 'could not remove schedules no job names');
    }
  }
  return { queues: [...queues] };
}
