import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextResponse } from 'next/server';
import {
  COMMIT_COOKIE_NAME,
  appendReturningCommit,
  cookieMaxAge,
  parseReturningCommits,
  rememberUntil,
  removeReturningCommit,
  serializeReturningCommits,
  setReturningCommitCookie,
} from './returning-participant';

const DAY = 24 * 60 * 60;
const NOW = new Date('2026-10-04T09:00:00.000Z');
const NOW_SECONDS = NOW.getTime() / 1000;
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY * 1000);

describe('returning-participant cookie', () => {
  it('cookie name is stable across versions', () => {
    expect(COMMIT_COOKIE_NAME).toBe('os_commit');
  });

  it('roundtrips a list of commits with signupId', () => {
    const value = serializeReturningCommits([
      { commitmentId: 'com_abc', token: 'tokOne_-A1', signupId: 'sig_one' },
      { commitmentId: 'com_def', token: 'tok2', signupId: 'sig_two' },
    ]);
    expect(parseReturningCommits(value)).toEqual([
      { commitmentId: 'com_abc', token: 'tokOne_-A1', signupId: 'sig_one' },
      { commitmentId: 'com_def', token: 'tok2', signupId: 'sig_two' },
    ]);
  });

  it('parses legacy single-entry cookies (no comma, no signupId)', () => {
    expect(parseReturningCommits('com_abc.tok')).toEqual([
      { commitmentId: 'com_abc', token: 'tok' },
    ]);
  });

  it('parses legacy multi-entry cookies without signupId', () => {
    expect(parseReturningCommits('com_a.ta,com_b.tb')).toEqual([
      { commitmentId: 'com_a', token: 'ta' },
      { commitmentId: 'com_b', token: 'tb' },
    ]);
  });

  it('returns empty list for unparseable values', () => {
    expect(parseReturningCommits('')).toEqual([]);
    expect(parseReturningCommits(null)).toEqual([]);
    expect(parseReturningCommits('justone')).toEqual([]);
  });

  it('skips entries with invalid commitment id prefix', () => {
    expect(parseReturningCommits('par_abc.tok,com_ok.tok2.sig_x')).toEqual([
      { commitmentId: 'com_ok', token: 'tok2', signupId: 'sig_x' },
    ]);
  });

  it('appends a new commit to the front and de-dupes the same id', () => {
    const add = (raw: string | null, commitmentId: string, token: string) =>
      appendReturningCommit(raw, { commitmentId, token, signupId: 'sig_x', slotAt: null }, NOW);
    const ab = add(add(null, 'com_a', 'ta'), 'com_b', 'tb');
    expect(parseReturningCommits(ab).map((c) => c.commitmentId)).toEqual(['com_b', 'com_a']);

    // re-appending the same id replaces the prior token (e.g. token rotation)
    const expiresAt = NOW_SECONDS + 60 * DAY;
    expect(parseReturningCommits(add(ab, 'com_a', 'ta2'))).toEqual([
      { commitmentId: 'com_a', token: 'ta2', signupId: 'sig_x', expiresAt },
      { commitmentId: 'com_b', token: 'tb', signupId: 'sig_x', expiresAt },
    ]);
  });

  it('appends without signupId for callers that omit it', () => {
    const next = appendReturningCommit(
      null,
      { commitmentId: 'com_a', token: 'ta', slotAt: null },
      NOW,
    );
    expect(parseReturningCommits(next)).toEqual([
      { commitmentId: 'com_a', token: 'ta', expiresAt: NOW_SECONDS + 60 * DAY },
    ]);
  });

  it('removes a single commit, leaving the rest', () => {
    const start = serializeReturningCommits([
      { commitmentId: 'com_a', token: 'ta', signupId: 'sig_x' },
      { commitmentId: 'com_b', token: 'tb', signupId: 'sig_x' },
      { commitmentId: 'com_c', token: 'tc', signupId: 'sig_y' },
    ]);
    const after = removeReturningCommit(start, 'com_b', NOW);
    expect(parseReturningCommits(after).map((c) => c.commitmentId)).toEqual(['com_a', 'com_c']);
  });

  it('mixes legacy and new entries in one cookie', () => {
    const value = 'com_old.tokOld,com_new.tokNew.sig_z';
    expect(parseReturningCommits(value)).toEqual([
      { commitmentId: 'com_old', token: 'tokOld' },
      { commitmentId: 'com_new', token: 'tokNew', signupId: 'sig_z' },
    ]);
  });

  it('writes and reads each entry with its expiry last', () => {
    const value = serializeReturningCommits([
      { commitmentId: 'com_a', token: 'ta', signupId: 'sig_x', expiresAt: 1798000000 },
      { commitmentId: 'com_b', token: 'tb', expiresAt: 1798000001 },
    ]);
    expect(value).toBe('com_a.ta.sig_x.1798000000,com_b.tb.1798000001');
    expect(parseReturningCommits(value)).toEqual([
      { commitmentId: 'com_a', token: 'ta', signupId: 'sig_x', expiresAt: 1798000000 },
      { commitmentId: 'com_b', token: 'tb', expiresAt: 1798000001 },
    ]);
  });

  it('reads an entry without an expiry, as written before, next to one with', () => {
    expect(parseReturningCommits('com_old.tokOld.sig_z,com_new.tokNew.sig_z.1798000000')).toEqual([
      { commitmentId: 'com_old', token: 'tokOld', signupId: 'sig_z' },
      { commitmentId: 'com_new', token: 'tokNew', signupId: 'sig_z', expiresAt: 1798000000 },
    ]);
  });

  // An all-digit last segment is an expiry only when a token is left before it.
  it('does not take an all-digit token for an expiry', () => {
    expect(parseReturningCommits('com_a.12345')).toEqual([
      { commitmentId: 'com_a', token: '12345' },
    ]);
  });

  it('gives entries without an expiry 60 days from the rewrite, and keeps the rest', () => {
    const far = rememberUntil(inDays(200), NOW);
    const raw = `com_old.tokOld.sig_z,com_far.tokFar.sig_z.${far}`;
    const next = appendReturningCommit(
      raw,
      { commitmentId: 'com_new', token: 'tokNew', signupId: 'sig_z', slotAt: null },
      NOW,
    );
    const sixtyDays = NOW_SECONDS + 60 * DAY;
    expect(parseReturningCommits(next)).toEqual([
      { commitmentId: 'com_new', token: 'tokNew', signupId: 'sig_z', expiresAt: sixtyDays },
      { commitmentId: 'com_old', token: 'tokOld', signupId: 'sig_z', expiresAt: sixtyDays },
      { commitmentId: 'com_far', token: 'tokFar', signupId: 'sig_z', expiresAt: far },
    ]);
  });

  it('drops the entries whose expiry has passed when it rewrites the cookie', () => {
    const raw = serializeReturningCommits([
      { commitmentId: 'com_gone', token: 't1', signupId: 'sig_z', expiresAt: NOW_SECONDS - 1 },
      { commitmentId: 'com_kept', token: 't2', signupId: 'sig_z', expiresAt: NOW_SECONDS + DAY },
      { commitmentId: 'com_off', token: 't3', signupId: 'sig_z', expiresAt: NOW_SECONDS + DAY },
    ]);
    const next = removeReturningCommit(raw, 'com_off', NOW);
    expect(parseReturningCommits(next).map((c) => c.commitmentId)).toEqual(['com_kept']);
  });

  it('keeps the newest 36 entries, so the cookie stays under 4096 bytes', () => {
    let raw: string | null = null;
    for (let i = 0; i < 40; i += 1) {
      raw = appendReturningCommit(
        raw,
        {
          commitmentId: `com_${String(i).padStart(22, '0')}`,
          token: 'x'.repeat(43),
          signupId: `sig_${'0'.repeat(22)}`,
          slotAt: inDays(300),
        },
        NOW,
      );
    }
    const kept = parseReturningCommits(raw);
    expect(kept).toHaveLength(36);
    expect(kept[0]?.commitmentId).toBe(`com_${'39'.padStart(22, '0')}`);
    // What the browser is sent: the value with its commas escaped.
    expect(`${COMMIT_COOKIE_NAME}=${encodeURIComponent(raw ?? '')}`.length).toBeLessThan(4096);
  });
});

describe('how long the cookie remembers a sign-up', () => {
  it('remembers one for a slot with no date for 60 days', () => {
    expect(rememberUntil(null, NOW)).toBe(NOW_SECONDS + 60 * DAY);
  });

  it('remembers one for a slot up to 53 days away for 60 days', () => {
    expect(rememberUntil(inDays(3), NOW)).toBe(NOW_SECONDS + 60 * DAY);
    expect(rememberUntil(inDays(53), NOW)).toBe(NOW_SECONDS + 60 * DAY);
  });

  it('remembers one for a later slot until a week after it', () => {
    expect(rememberUntil(inDays(100), NOW)).toBe(NOW_SECONDS + 107 * DAY);
  });

  it('remembers one no longer than a browser keeps a cookie, 400 days', () => {
    expect(rememberUntil(inDays(398), NOW)).toBe(NOW_SECONDS + 400 * DAY);
  });

  it('treats a slot whose date does not parse as having none', () => {
    expect(rememberUntil(new Date('not a date'), NOW)).toBe(NOW_SECONDS + 60 * DAY);
  });

  it('lasts as long as its latest entry, and at least 60 days', () => {
    expect(cookieMaxAge([], NOW)).toBe(60 * DAY);
    expect(
      cookieMaxAge(
        [
          { commitmentId: 'com_a', token: 'ta', expiresAt: NOW_SECONDS + 20 * DAY },
          { commitmentId: 'com_b', token: 'tb', expiresAt: NOW_SECONDS + 150 * DAY },
          { commitmentId: 'com_c', token: 'tc' },
        ],
        NOW,
      ),
    ).toBe(150 * DAY);
  });

  it('never asks a browser to keep it past 400 days', () => {
    const forever = { commitmentId: 'com_a', token: 'ta', expiresAt: NOW_SECONDS + 9000 * DAY };
    expect(cookieMaxAge([forever], NOW)).toBe(400 * DAY);
  });
});

describe('setReturningCommitCookie', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function mockResponse() {
    const set = vi.fn();
    return { response: { cookies: { set } } as unknown as NextResponse, set };
  }

  it('sets secure:true when the app is served over https', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://opensignup.org');
    const { response, set } = mockResponse();
    setReturningCommitCookie(response, 'com_a.tok');
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });

  it('sets secure:false over plain http even in production builds', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'production');
    const { response, set } = mockResponse();
    setReturningCommitCookie(response, 'com_a.tok');
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ secure: false }));
  });

  it('falls back to NODE_ENV when NEXT_PUBLIC_APP_URL is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    const { response, set } = mockResponse();
    setReturningCommitCookie(response, 'com_a.tok');
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });

  it('sets a Max-Age that lasts until a week after the latest slot it holds', () => {
    const { response, set } = mockResponse();
    const value = appendReturningCommit(
      null,
      { commitmentId: 'com_a', token: 'ta', signupId: 'sig_x', slotAt: inDays(100) },
      NOW,
    );
    setReturningCommitCookie(response, value, NOW);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ maxAge: 107 * DAY }));
  });

  it('sets a Max-Age of 60 days for a cookie written before entries had an expiry', () => {
    const { response, set } = mockResponse();
    setReturningCommitCookie(response, 'com_a.tok', NOW);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ maxAge: 60 * DAY }));
  });

  it('always sets httpOnly and sameSite:lax', () => {
    const { response, set } = mockResponse();
    setReturningCommitCookie(response, 'com_a.tok');
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', name: COMMIT_COOKIE_NAME }),
    );
  });
});
