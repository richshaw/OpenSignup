# A site's own background jobs

This folder is empty in OpenSignup. It's for a site that runs its own copy, a clone or a fork it updates from here, and wants background jobs of its own: a weekly summary for whoever runs the site, say, or a nightly export to another system. Files you add here are files OpenSignup never has, so updating your copy never conflicts with them.

## Adding jobs

Add a file whose name ends in `.jobs.ts`, such as `digest.jobs.ts`, that exports a `jobs` array:

```ts
import type { JobDefinition } from '@/jobs/registry';

export const jobs: JobDefinition[] = [
  {
    name: 'site.digest',
    schedule: '0 8 * * 1', // Mondays at 08:00 UTC
    run: async () => {
      // …
    },
  },
];
```

When the worker (`pnpm worker`) starts, it imports every `*.jobs.ts` file here, in name order, and runs their jobs beside its own. `JobDefinition` in `src/jobs/registry.ts` says what each field does. Other files here, such as helpers and tests, are left alone.

- **Names.** Start every queue name with a prefix of your own, such as `site.`, so it never meets one of OpenSignup's. A file that names a queue already taken, or one starting `__pgboss__`, is skipped.
- **Data.** A job gets the data it was sent with. One queued by its `schedule` gets `{}`.
- **Schedules.** A job with a `schedule` is queued on it, in UTC. The worker owns pg-boss's whole schedule table: at each start it keeps exactly the schedules its jobs name and removes every other. So deleting a job, or leaving `jobs` empty, removes its schedule at the next start, which makes an empty `jobs` array an off switch. It also means a schedule made any other way (with `boss.schedule()` in a script, say) is removed at the next start, and two checkouts sharing one database remove each other's. If this folder can't be listed when the worker starts, or removing a schedule fails, the worker logs it and removes nothing more that time.
- **Failures.** A file that throws when it's imported, exports no usable `jobs` (each needs a `name` and a `run` function; a `schedule`, if given, can't be empty), or fails to register is logged and skipped, along with its schedules, and the worker's own jobs and every other file still run. Do nothing when the file is imported but define `jobs`: a promise rejected at import with nothing waiting for it, or a timer that throws, stops the whole worker, reminders included.
- **Running twice.** A job that throws is logged and retried by pg-boss, twice, at once, and so is one still running after 15 minutes, pg-boss's default, which can then run beside its own retry. So a job that must not run twice, such as one that sends an email, records what it did first and checks that record before it starts.
- **One worker.** An instance runs exactly one worker process, so a job never runs alongside a copy of itself on another machine.
- **Shared code.** Import what you need from OpenSignup, such as the database client (`@/db/client`) or the email transport (`@/email`).

## Before you add one

- **Your privacy page.** If a job emails people, or keeps or sends anything about them, your privacy page has to say so.
- **Your source.** A job you add is a change to OpenSignup's code. OpenSignup is AGPL-3.0, so if your site is open to other people, point `NEXT_PUBLIC_SOURCE_URL` at where your copy's code can be read, as [Branding your instance](../../../README.md#branding-your-instance) in the README says.
