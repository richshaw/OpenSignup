import { describe, expect, it } from 'vitest';
import { classifyWorkerStatus, WORKER_STALE_AFTER_MS } from './worker-health';

const now = new Date('2026-06-09T12:00:00Z');

describe('classifyWorkerStatus', () => {
  it('reports ok when the dispatch cron completed recently', () => {
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(classifyWorkerStatus(fiveMinAgo, now)).toBe('ok');
  });

  it('reports ok right up to the staleness boundary', () => {
    const atBoundary = new Date(now.getTime() - WORKER_STALE_AFTER_MS);
    expect(classifyWorkerStatus(atBoundary, now)).toBe('ok');
  });

  it('reports stale when the last completion is older than the boundary', () => {
    const justOver = new Date(now.getTime() - WORKER_STALE_AFTER_MS - 1);
    expect(classifyWorkerStatus(justOver, now)).toBe('stale');
  });

  it('reports stale when the worker has never completed a dispatch', () => {
    expect(classifyWorkerStatus(null, now)).toBe('stale');
  });
});
