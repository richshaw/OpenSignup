import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { log } from '@/lib/log';
import {
  EXTENSIONS_DIR,
  loadExtensions,
  registerJobs,
  startJobs,
  unscheduleOthers,
  type JobBoss,
  type JobDefinition,
} from './registry';

type Handler = (batch: { data: object | null }[]) => Promise<unknown>;

/**
 * A pg-boss stand-in that records what was asked of it. `failing` makes one
 * call refuse: working a given queue, or listing the schedules.
 */
function fakeBoss(
  existingSchedules: string[] = [],
  failing: { work?: string; getSchedules?: boolean } = {},
) {
  const calls: string[] = [];
  const handlers = new Map<string, Handler>();
  const schedules = new Set(existingSchedules);
  const boss = {
    createQueue: vi.fn(async (name: string) => {
      calls.push(`createQueue ${name}`);
    }),
    schedule: vi.fn(async (name: string, cron: string) => {
      if (cron === 'not a cron') throw new Error(`${cron} is not a cron expression`);
      calls.push(`schedule ${name} ${cron}`);
      schedules.add(name);
    }),
    work: vi.fn(async (name: string, handler: Handler) => {
      if (name === failing.work) throw new Error(`could not work ${name}`);
      calls.push(`work ${name}`);
      handlers.set(name, handler);
      return `worker-${name}`;
    }),
    offWork: vi.fn(async (name: string) => {
      calls.push(`offWork ${name}`);
      handlers.delete(name);
    }),
    getSchedules: vi.fn(async () => {
      if (failing.getSchedules) throw new Error('connection lost');
      return [...schedules].map((name) => ({ name, cron: '* * * * *' }));
    }),
    unschedule: vi.fn(async (name: string) => {
      schedules.delete(name);
    }),
  };
  return { boss: boss as unknown as JobBoss, calls, handlers, schedules };
}

const noop = async () => {};

/** `log.error` as the registry calls it: fields, then a message. */
let errors: MockInstance<(fields: object, message: string) => void>;
beforeEach(() => {
  errors = vi.spyOn(log, 'error').mockImplementation(() => undefined) as unknown as typeof errors;
  vi.spyOn(log, 'info').mockImplementation(() => undefined);
  vi.spyOn(log, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** The messages `log.error` was called with. */
const errorMessages = () => errors.mock.calls.map((call) => call[1]);

describe('registerJobs', () => {
  it('creates every queue and schedule before working any queue', async () => {
    const { boss, calls } = fakeBoss();
    await registerJobs(boss, [
      { name: 'site.a', schedule: '0 * * * *', run: noop },
      { name: 'site.b', run: noop },
    ]);
    expect(calls).toEqual([
      'createQueue site.a',
      'schedule site.a 0 * * * *',
      'createQueue site.b',
      'work site.a',
      'work site.b',
    ]);
  });

  it("runs each job in a batch with that job's data", async () => {
    const { boss, handlers } = fakeBoss();
    const run = vi.fn(noop);
    await registerJobs(boss, [{ name: 'site.a', run }]);
    await handlers.get('site.a')?.([{ data: { id: 1 } }, { data: { id: 2 } }]);
    expect(run.mock.calls).toEqual([[{ id: 1 }], [{ id: 2 }]]);
  });

  it('logs a failure with its message and fields, then throws it so pg-boss retries', async () => {
    const { boss, handlers } = fakeBoss();
    const failure = new Error('mail server down');
    await registerJobs(boss, [
      {
        name: 'site.send',
        run: async () => {
          throw failure;
        },
        failureMessage: 'site send failed',
        logFields: (data: { thingId?: string }) => ({ thingId: data.thingId }),
      },
    ]);
    await expect(handlers.get('site.send')?.([{ data: { thingId: 'thg_1' } }])).rejects.toBe(
      failure,
    );
    expect(errors).toHaveBeenCalledWith(
      { err: failure, queue: 'site.send', thingId: 'thg_1' },
      'site send failed',
    );
  });

  it('names the queue in a failure that gives no message of its own', async () => {
    const { boss, handlers } = fakeBoss();
    await registerJobs(boss, [
      {
        name: 'site.a',
        run: async () => {
          throw new Error('boom');
        },
      },
    ]);
    await expect(handlers.get('site.a')?.([{ data: {} }])).rejects.toThrow('boom');
    expect(errorMessages()).toEqual(['site.a failed']);
  });

  it('gives a job queued by its schedule, which pg-boss sends with no data, an empty object', async () => {
    const { boss, handlers } = fakeBoss();
    const run = vi.fn(noop);
    await registerJobs(boss, [{ name: 'site.a', schedule: '0 * * * *', run }]);
    await handlers.get('site.a')?.([{ data: null }]);
    expect(run).toHaveBeenCalledWith({});
  });

  it('still logs the failure when logFields throws, and never lets it replace the error or queue', async () => {
    const { boss, handlers } = fakeBoss();
    const failure = new Error('mail server down');
    const fail = async () => {
      throw failure;
    };
    await registerJobs(boss, [
      {
        name: 'site.throws',
        run: fail,
        logFields: (data: { thingId: string }) => ({ thingId: data.thingId.toUpperCase() }),
      },
      { name: 'site.shadows', run: fail, logFields: () => ({ err: 'not it', queue: 'not it' }) },
    ]);
    await expect(handlers.get('site.throws')?.([{ data: null }])).rejects.toBe(failure);
    await expect(handlers.get('site.shadows')?.([{ data: {} }])).rejects.toBe(failure);
    expect(errors.mock.calls.map(([fields]) => fields)).toEqual([
      { err: failure, queue: 'site.throws' },
      { err: failure, queue: 'site.shadows' },
    ]);
  });

  it('works no queue when a schedule is refused', async () => {
    const { boss } = fakeBoss();
    await expect(
      registerJobs(boss, [
        { name: 'site.a', schedule: '0 * * * *', run: noop },
        { name: 'site.b', schedule: 'not a cron', run: noop },
      ]),
    ).rejects.toThrow('not a cron expression');
    expect(boss.work).not.toHaveBeenCalled();
  });

  it('stops the queues it started when a later one fails to start', async () => {
    const { boss, calls, handlers } = fakeBoss([], { work: 'site.b' });
    await expect(
      registerJobs(boss, [
        { name: 'site.a', run: noop },
        { name: 'site.b', run: noop },
      ]),
    ).rejects.toThrow('could not work site.b');
    expect(calls).toContain('offWork site.a');
    expect(handlers.size).toBe(0);
  });
});

describe('unscheduleOthers', () => {
  it("removes every schedule but those kept and pg-boss's own", async () => {
    const { boss, schedules } = fakeBoss(['site.a', 'site.gone', '__pgboss__send-it']);
    await unscheduleOthers(boss, new Set(['site.a']));
    expect([...schedules].sort()).toEqual(['__pgboss__send-it', 'site.a']);
  });
});

describe('the extensions folder', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'worker-extensions-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** Writes a file into the temporary extensions folder. */
  const put = (file: string, source: string) => writeFile(path.join(dir, file), source);
  const jobsFile = (...names: string[]) =>
    `export const jobs = [${names.map((name) => `{ name: '${name}', run: async () => {} }`).join(', ')}];`;

  describe('loadExtensions', () => {
    it('imports each *.jobs.ts file in name order, and nothing else', async () => {
      await put('b.jobs.ts', jobsFile('site.b'));
      await put('a.jobs.ts', jobsFile('site.a1', 'site.a2'));
      await put('helper.ts', 'throw new Error("a helper is not an extension");');
      await put('a.jobs.test.ts', 'throw new Error("a test is not an extension");');
      await put('README.md', '# Notes');

      const loaded = await loadExtensions(dir);
      expect((loaded ?? []).map(({ file, jobs }) => [file, jobs.map((job) => job.name)])).toEqual([
        ['a.jobs.ts', ['site.a1', 'site.a2']],
        ['b.jobs.ts', ['site.b']],
      ]);
      expect(errors).not.toHaveBeenCalled();
    });

    it('takes an empty jobs array as a file with nothing to run', async () => {
      await put('off.jobs.ts', 'export const jobs = [];');
      expect(await loadExtensions(dir)).toEqual([{ file: 'off.jobs.ts', jobs: [] }]);
    });

    it('logs and skips a file that throws on import or exports no usable jobs', async () => {
      await put('a.jobs.ts', 'throw new Error("missing setting");');
      await put('b.jobs.ts', 'export const job = {};');
      await put('c.jobs.ts', "export const jobs = [{ name: 'site.c' }];");
      await put('d.jobs.ts', jobsFile('site.d'));

      const loaded = await loadExtensions(dir);
      expect((loaded ?? []).map(({ file }) => file)).toEqual(['d.jobs.ts']);
      expect(errorMessages()).toEqual([
        'worker extension skipped: it failed to load',
        'worker extension skipped: it exports no `jobs` array',
        'worker extension skipped: one of its `jobs` is not a valid job definition',
      ]);
      expect(errors.mock.calls[0]?.[0]).toMatchObject({
        file: 'a.jobs.ts',
        err: expect.objectContaining({ message: 'missing setting' }),
      });
    });

    it.each([
      ['an empty schedule', "schedule: ''"],
      ['a failure message that is not text', 'failureMessage: 5'],
      ['log fields that are not a function', "logFields: 'thingId'"],
    ])('skips a job with %s', async (_case, field) => {
      await put(
        'a.jobs.ts',
        `export const jobs = [{ name: 'site.a', run: async () => {}, ${field} }];`,
      );
      expect(await loadExtensions(dir)).toEqual([]);
      expect(errorMessages()).toEqual([
        'worker extension skipped: one of its `jobs` is not a valid job definition',
      ]);
    });

    it("logs a folder it can't list, and says so rather than finding none", async () => {
      expect(await loadExtensions(path.join(dir, 'missing'))).toBeNull();
      expect(errorMessages()).toEqual([
        'worker extensions skipped: the folder could not be listed',
      ]);
    });

    // Checks where the folder is, not what's in it: a site's own copy holds
    // its jobs, and this test must pass there too.
    it('looks in the folder beside the registry, which OpenSignup ships with its README', () => {
      expect(EXTENSIONS_DIR).toBe(path.join(__dirname, 'extensions'));
      expect(existsSync(path.join(EXTENSIONS_DIR, 'README.md'))).toBe(true);
    });
  });

  describe('startJobs', () => {
    const builtIn: JobDefinition[] = [
      { name: 'reminders.dispatch', schedule: '*/10 * * * *', run: noop },
      { name: 'reminders.send', run: noop },
    ];

    it("registers the worker's own jobs, then each extension's", async () => {
      await put('digest.jobs.ts', jobsFile('site.digest'));
      const { boss, handlers } = fakeBoss();

      const { queues } = await startJobs(boss, builtIn, dir);
      expect(queues).toEqual(['reminders.dispatch', 'reminders.send', 'site.digest']);
      expect([...handlers.keys()]).toEqual(queues);
    });

    it('skips an extension that fails, and still runs the rest', async () => {
      await put('a.jobs.ts', 'throw new Error("missing setting");');
      await put('b.jobs.ts', jobsFile('site.b'));
      const { boss } = fakeBoss();

      const { queues } = await startJobs(boss, builtIn, dir);
      expect(queues).toEqual(['reminders.dispatch', 'reminders.send', 'site.b']);
    });

    it("skips an extension whose queue is already taken, named twice, or pg-boss's own", async () => {
      await put('a.jobs.ts', jobsFile('site.a', 'reminders.send'));
      await put('b.jobs.ts', jobsFile('site.b', 'site.b'));
      await put('c.jobs.ts', jobsFile('__pgboss__send-it'));
      await put('d.jobs.ts', jobsFile('site.d'));
      const { boss } = fakeBoss();

      const { queues } = await startJobs(boss, builtIn, dir);
      expect(queues).toEqual(['reminders.dispatch', 'reminders.send', 'site.d']);
      expect(errors.mock.calls.map(([fields]) => fields)).toEqual([
        { file: 'a.jobs.ts', queue: 'reminders.send' },
        { file: 'b.jobs.ts', queue: 'site.b' },
        { file: 'c.jobs.ts', queue: '__pgboss__send-it' },
      ]);
    });

    it('skips an extension that fails to register, and removes the schedules it left', async () => {
      await put(
        'a.jobs.ts',
        `export const jobs = [
          { name: 'site.hourly', schedule: '0 * * * *', run: async () => {} },
          { name: 'site.broken', schedule: 'not a cron', run: async () => {} },
        ];`,
      );
      const { boss, handlers, schedules } = fakeBoss();

      const { queues } = await startJobs(boss, builtIn, dir);
      expect(queues).toEqual(['reminders.dispatch', 'reminders.send']);
      expect(handlers.has('site.hourly')).toBe(false);
      expect([...schedules]).toEqual(['reminders.dispatch']);
      expect(errorMessages()).toEqual(['worker extension skipped: it failed to register']);
    });

    it('removes the schedule of a job that is gone', async () => {
      const { boss, schedules } = fakeBoss(['site.retired', 'reminders.dispatch']);
      await startJobs(boss, builtIn, dir);
      expect([...schedules]).toEqual(['reminders.dispatch']);
    });

    it("runs its jobs anyway when it can't list the schedules to remove", async () => {
      const { boss, handlers } = fakeBoss([], { getSchedules: true });
      const { queues } = await startJobs(boss, builtIn, dir);
      expect(queues).toEqual(['reminders.dispatch', 'reminders.send']);
      expect([...handlers.keys()]).toEqual(queues);
      expect(errorMessages()).toEqual(['could not remove schedules no job names']);
    });

    it("removes no schedule when it can't list the extensions folder", async () => {
      const { boss, schedules } = fakeBoss(['site.digest']);
      const { queues } = await startJobs(boss, builtIn, path.join(dir, 'missing'));
      expect(queues).toEqual(['reminders.dispatch', 'reminders.send']);
      expect([...schedules].sort()).toEqual(['reminders.dispatch', 'site.digest']);
      expect(boss.unschedule).not.toHaveBeenCalled();
    });

    it("stops the worker when one of its own jobs can't register", async () => {
      const { boss } = fakeBoss();
      await expect(
        startJobs(boss, [{ name: 'reminders.dispatch', schedule: 'not a cron', run: noop }], dir),
      ).rejects.toThrow('not a cron expression');
    });

    it('stops the worker when two of its own jobs share a queue', async () => {
      const { boss } = fakeBoss();
      await expect(startJobs(boss, [...builtIn, builtIn[1]!], dir)).rejects.toThrow(
        "two of the worker's own jobs use the queue reminders.send",
      );
    });
  });
});
