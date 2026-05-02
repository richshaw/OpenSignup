import type { NextResponse } from 'next/server';

export const COMMIT_COOKIE_NAME = 'os_commit';
const MAX_AGE_DAYS = 60;
const MAX_ENTRIES = 40;

export interface ReturningCommit {
  commitmentId: string;
  token: string;
}

function serializeOne(c: ReturningCommit): string {
  return `${c.commitmentId}.${encodeURIComponent(c.token)}`;
}

function parseOne(raw: string): ReturningCommit | null {
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot >= raw.length - 1) return null;
  const commitmentId = raw.slice(0, dot);
  if (!commitmentId.startsWith('com_')) return null;
  let token: string;
  try {
    token = decodeURIComponent(raw.slice(dot + 1));
  } catch {
    return null;
  }
  if (!token) return null;
  return { commitmentId, token };
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
): string {
  const existing = parseReturningCommits(raw).filter((c) => c.commitmentId !== commitmentId);
  const next = [{ commitmentId, token }, ...existing].slice(0, MAX_ENTRIES);
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
