/**
 * The dashboard's `before` search param names the last signup of the previous
 * page. Anything that isn't a signup id (missing, repeated, garbled) means the
 * first page; it never errors.
 */
const SIGNUP_ID = /^sig_[0-9A-Za-z]{1,40}$/;

export function parseBefore(raw: string | string[] | undefined): string | undefined {
  return typeof raw === 'string' && SIGNUP_ID.test(raw) ? raw : undefined;
}

/**
 * The line under "Your signups": the workspace's real total, on every page.
 * None for an empty workspace, whose empty state below already says so.
 */
export function signupCountLabel(total: number): string | null {
  return total === 0 ? null : `${total} total`;
}

/** Where "Show older signups" goes, or null when this page is the oldest. */
export function olderSignupsHref(nextBefore: string | null): string | null {
  return nextBefore ? `/app?before=${encodeURIComponent(nextBefore)}` : null;
}
