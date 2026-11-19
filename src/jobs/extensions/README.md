# A site's own background jobs

This folder is empty in OpenSignup. It's for a site that runs OpenSignup from a repo of its own, one that merges this one, and wants background jobs of its own: a weekly digest, say, or a note to new organizers. Putting them here means the site never edits a file OpenSignup also changes, so merges stay clean.

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

- **Names.** Start every queue name with a prefix of your own, such as `site.`, so it never meets one of OpenSignup's. A file that names a queue already taken is skipped.
- **Schedules.** A job with a `schedule` is queued on it, in UTC. The worker's schedules are exactly those its jobs name when it starts, so deleting a job, or leaving `jobs` empty, removes its schedule at the next start. That makes an empty `jobs` array an off switch.
- **Failures.** A file that throws when it's imported, exports no usable `jobs`, or fails to register is logged and skipped, along with its schedules. The worker's own jobs and every other file still run. A job that throws is logged and retried by pg-boss, twice, at once, so a job that must not run twice, such as one that sends an email, records what it did first and checks that record before it starts.
- **One worker.** An instance runs exactly one worker process, so a job never runs alongside a copy of itself on another machine.
- **Shared code.** Import what you need from OpenSignup, such as the database client (`@/db/client`) or the email transport (`@/email`).
