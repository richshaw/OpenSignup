import type { NextResponse } from 'next/server';

export const COMMIT_COOKIE_NAME = 'os_commit';
const MAX_AGE_DAYS = 60;
const MAX_ENTRIES = 40;

export interface ReturningCommit {
  commitmentId: string;
  token: string;
  signupId?: string;
}

function serializeOne(c: ReturningCommit): string {
  const base = `${c.commitmentId}.${encodeURIComponent(c.token)}`;
  return c.signupId ? `${base}.${c.signupId}` : base;
}

function parseOne(raw: string): ReturningCommit | null {
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
  return signupId ? { commitmentId, token, signupId } : { commitmentId, token };
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

export function appendReturningCommit(
  raw: string | null | undefined,
  commitmentId: string,
  token: string,
  signupId?: string,
): string {
  const existing = parseReturningCommits(raw).filter((c) => c.commitmentId !== commitmentId);
  const entry: ReturningCommit = signupId
    ? { commitmentId, token, signupId }
    : { commitmentId, token };
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  return serializeReturningCommits(next);
}

export function removeReturningCommit(
  raw: string | null | undefined,
  commitmentId: string,
): string {
  return serializeReturningCommits(
    parseReturningCommits(raw).filter((c) => c.commitmentId !== commitmentId),
  );
}

export function setReturningCommitCookie(response: NextResponse, value: string): void {
  // Path `/` — every API route mutating commits needs to read/write this cookie,
  // and SSR filters by signup_id, so cross-signup leakage is impossible.
  // httpOnly: cookie carries edit-token capabilities; no client code reads it.
  response.cookies.set({
    name: COMMIT_COOKIE_NAME,
    value,
    path: '/',
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
    sameSite: 'lax',
    httpOnly: true,
  });
}
