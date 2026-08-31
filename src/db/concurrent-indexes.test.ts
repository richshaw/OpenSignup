import { describe, expect, it } from 'vitest';
import { CONCURRENT_INDEXES } from './concurrent-indexes';

describe('CONCURRENT_INDEXES', () => {
  it('builds every index concurrently', () => {
    // The whole reason these are not ordinary migrations. A plain CREATE INDEX
    // holds a SHARE lock for the length of the build, blocking every insert
    // into the table — for `activity` that is participant commits, page views
    // and telemetry, on a table that grows with the lifetime of the site.
    for (const index of CONCURRENT_INDEXES) {
      expect(index.create).toMatch(/CREATE INDEX CONCURRENTLY/);
    }
  });

  it('makes every index idempotent to re-apply', () => {
    // applyConcurrentIndexes runs on every `pnpm db:migrate`, so a second run
    // has to be a no-op rather than an error that aborts the whole step.
    for (const index of CONCURRENT_INDEXES) {
      expect(index.create).toMatch(/IF NOT EXISTS/);
    }
  });

  it('names each index the same way the SQL does, so the repair path can find it', () => {
    // applyConcurrentIndexes drops by `name` when it finds an invalid build.
    // A mismatch there silently disables the repair.
    for (const index of CONCURRENT_INDEXES) {
      expect(index.create).toContain(`"${index.name}"`);
    }
  });
});
