import type { NextResponse } from 'next/server';

export const COMMIT_COOKIE_NAME = 'os_commit';

const DAY_SECONDS = 24 * 60 * 60;
/** Every sign-up is remembered for at least this long… */
const MIN_DAYS = 60;
/** …and until this long after its slot, for someone who signs up far ahead. */
const DAYS_AFTER_SLOT = 7;
/** The longest a browser keeps any cookie: it cuts a longer Max-Age to this. */
const MAX_DAYS = 400;
/**
 * An entry is 111 bytes as sent (two 26-character ids, a 43-character token, a
 * 10-digit expiry, three dots and a comma escaped as `%2C`), so 36 of them keep
 * the cookie under the 4096 bytes a browser stores for one. Past that it would
 * drop the whole cookie.
 */
const MAX_ENTRIES = 36;

export interface ReturningCommit {
  commitmentId: string;
  token: string;
  signupId?: string;
  /**
   * When this browser may forget the sign-up, in seconds since the epoch (see
   * `rememberUntil`). Missing from entries written before entries had one;
   * the next rewrite gives them `MIN_DAYS` from then.
   */
  expiresAt?: number;
}

function toSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * When the cookie may forget a sign-up it takes in at `now`: a week after its
 * slot, but never sooner than 60 days from now, nor later than a browser would
 * keep the cookie. A slot with no date gets the 60 days.
 */
export function rememberUntil(slotAt: Date | null, now: Date): number {
  const nowSeconds = toSeconds(now);
  const floor = nowSeconds + MIN_DAYS * DAY_SECONDS;
  const afterSlot =
    slotAt && !Number.isNaN(slotAt.getTime())
      ? toSeconds(slotAt) + DAYS_AFTER_SLOT * DAY_SECONDS
      : floor;
  return Math.min(nowSeconds + MAX_DAYS * DAY_SECONDS, Math.max(floor, afterSlot));
}

/**
 * The cookie's Max-Age in seconds: until the last of its entries may be
 * forgotten, and never less than 60 days, as it always lasted.
 */
export function cookieMaxAge(commits: ReturningCommit[], now: Date): number {
  const nowSeconds = toSeconds(now);
  const latest = Math.max(
    nowSeconds + MIN_DAYS * DAY_SECONDS,
    ...commits.map((c) => c.expiresAt ?? 0),
  );
  return Math.min(latest, nowSeconds + MAX_DAYS * DAY_SECONDS) - nowSeconds;
}

function serializeOne(c: ReturningCommit): string {
  let out = `${c.commitmentId}.${encodeURIComponent(c.token)}`;
  if (c.signupId) out += `.${c.signupId}`;
  if (c.expiresAt !== undefined) out += `.${c.expiresAt}`;
  return out;
}

function parseOne(entry: string): ReturningCommit | null {
  // Format: com_ID.encodedToken[.sig_ID][.expiresAt]. The expiry is the last
  // segment and all digits, and is taken only when another dot comes before
  // it, so an entry written without one (com_ID.token) keeps its token.
  let raw = entry;
  let expiresAt: number | undefined;
  const expiryDot = raw.lastIndexOf('.');
  const expiry = raw.slice(expiryDot + 1);
  if (
    expiryDot > raw.indexOf('.') &&
    /^\d+$/.test(expiry) &&
    Number.isSafeInteger(Number(expiry))
  ) {
    expiresAt = Number(expiry);
    raw = raw.slice(0, expiryDot);
  }

  const firstDot = raw.indexOf('.');
  if (firstDot <= 0 || firstDot >= raw.length - 1) return null;
  const commitmentId = raw.slice(0, firstDot);
  if (!commitmentId.startsWith('com_')) return null;

  // Tail format: encodedToken[.sig_XYZ]. Use lastIndexOf so a token containing
  // a literal `.` (unusual — real edit tokens are base64url) still parses as
  // long as it isn't followed by something starting with `sig_`.
  const rest = raw.slice(firstDot + 1);
  const lastDot = rest.lastIndexOf('.');
  let encodedToken: string;
  let signupId: string | undefined;
  if (lastDot > 0 && rest.slice(lastDot + 1).startsWith('sig_')) {
    encodedToken = rest.slice(0, lastDot);
    signupId = rest.slice(lastDot + 1);
  } else {
    encodedToken = rest;
    signupId = undefined;
  }

  let token: string;
  try {
    token = decodeURIComponent(encodedToken);
  } catch {
    return null;
  }
  if (!token) return null;
  return {
    commitmentId,
    token,
    ...(signupId ? { signupId } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };
}

export function serializeReturningCommits(commits: ReturningCommit[]): string {
  return commits.map(serializeOne).join(',');
}

export function parseReturningCommits(raw: string | null | undefined): ReturningCommit[] {
  if (!raw) return [];
  const out: ReturningCommit[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    if (!part) continue;
    const parsed = parseOne(part);
    if (!parsed) continue;
    if (seen.has(parsed.commitmentId)) continue;
    seen.add(parsed.commitmentId);
    out.push(parsed);
  }
  return out;
}

/**
 * The cookie value a rewrite leaves: every entry with an expiry, an old one
 * given 60 days from now, and none whose expiry has passed.
 */
function rewrite(commits: ReturningCommit[], now: Date): string {
  const nowSeconds = toSeconds(now);
  const fallback = rememberUntil(null, now);
  const kept: ReturningCommit[] = [];
  for (const c of commits) {
    const expiresAt = c.expiresAt ?? fallback;
    if (expiresAt > nowSeconds) kept.push({ ...c, expiresAt });
  }
  return serializeReturningCommits(kept.slice(0, MAX_ENTRIES));
}

/**
 * Puts a sign-up at the front of the cookie, in place of any entry with its
 * id, remembered until `rememberUntil` says from its slot's `slotAt`.
 */
export function appendReturningCommit(
  raw: string | null | undefined,
  commit: { commitmentId: string; token: string; signupId?: string; slotAt: Date | null },
  now: Date = new Date(),
): string {
  const { slotAt, ...entry } = commit;
  const existing = parseReturningCommits(raw).filter((c) => c.commitmentId !== entry.commitmentId);
  return rewrite([{ ...entry, expiresAt: rememberUntil(slotAt, now) }, ...existing], now);
}

export function removeReturningCommit(
  raw: string | null | undefined,
  commitmentId: string,
  now: Date = new Date(),
): string {
  return rewrite(
    parseReturningCommits(raw).filter((c) => c.commitmentId !== commitmentId),
    now,
  );
}

/**
 * `Secure` follows the deployment scheme, not NODE_ENV: a production build
 * served over plain HTTP (intranet self-host, local `next start`, e2e) must
 * not set Secure or browsers silently drop the cookie — Chromium exempts
 * localhost, WebKit/Firefox do not. Falls back to NODE_ENV when
 * NEXT_PUBLIC_APP_URL is unset.
 */
function isHttpsDeployment(): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return appUrl.startsWith('https:');
  return process.env.NODE_ENV === 'production';
}

/**
 * Sets the cookie to `value`, which `appendReturningCommit` or
 * `removeReturningCommit` wrote, for as long as its entries need (see
 * `cookieMaxAge`).
 */
export function setReturningCommitCookie(
  response: NextResponse,
  value: string,
  now: Date = new Date(),
): void {
  // Path `/` — every API route mutating commits needs to read/write this cookie,
  // and SSR filters by signup_id, so cross-signup leakage is impossible.
  // httpOnly: cookie carries edit-token capabilities; no client code reads it.
  response.cookies.set({
    name: COMMIT_COOKIE_NAME,
    value,
    path: '/',
    maxAge: cookieMaxAge(parseReturningCommits(value), now),
    sameSite: 'lax',
    httpOnly: true,
    secure: isHttpsDeployment(),
  });
}
