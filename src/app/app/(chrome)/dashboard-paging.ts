import { WORKSPACE_LIST_LIMIT } from '@/schemas/signups';

/**
 * The dashboard pages with two search params, each naming a signup: `before`
 * (the last signup of a newer page, to show the page after it) and `after`
 * (the first signup of an older page, to show the page before it). Anything
 * that isn't a signup id (missing, repeated, garbled) means the first page; it
 * never errors. `before` wins if both come.
 */
const SIGNUP_ID = /^sig_[0-9A-Za-z]{1,40}$/;

function parseId(raw: string | string[] | undefined): string | undefined {
  return typeof raw === 'string' && SIGNUP_ID.test(raw) ? raw : undefined;
}

export type DashboardCursor = { before: string } | { after: string } | null;

export function parseCursor(params: {
  before?: string | string[];
  after?: string | string[];
}): DashboardCursor {
  const before = parseId(params.before);
  if (before) return { before };
  const after = parseId(params.after);
  return after ? { after } : null;
}

/** "201–210 of 210": which signups this page shows, out of how many. */
export function signupRangeLabel(offset: number, shown: number, total: number): string {
  const end = offset + shown;
  return `${offset + 1}–${end} of ${Math.max(total, end)}`;
}

/** Where "Older" goes, or null on the last page. */
export function olderSignupsHref(nextBefore: string | null): string | null {
  return nextBefore ? `/app?before=${encodeURIComponent(nextBefore)}` : null;
}

/**
 * Where "Newer" goes, or null on the first page. When the newer page is the
 * first one, the link is plain `/app`, so it shows a full first page even if
 * signups were added or deleted since this page loaded.
 */
export function newerSignupsHref(prevAfter: string | null, offset: number): string | null {
  if (!prevAfter) return null;
  return offset <= WORKSPACE_LIST_LIMIT ? '/app' : `/app?after=${encodeURIComponent(prevAfter)}`;
}
