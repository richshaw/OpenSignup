import { describe, expect, it } from 'vitest';
import {
  COMMIT_COOKIE_NAME,
  appendReturningCommit,
  parseReturningCommits,
  removeReturningCommit,
  serializeReturningCommits,
} from './returning-participant';

describe('returning-participant cookie', () => {
  it('cookie name is stable across versions', () => {
    expect(COMMIT_COOKIE_NAME).toBe('os_commit');
  });

  it('roundtrips a list of commits with special-char tokens', () => {
    const value = serializeReturningCommits([
      { commitmentId: 'com_abc', token: 'tok-1.with_special' },
      { commitmentId: 'com_def', token: 'tok2' },
    ]);
    expect(parseReturningCommits(value)).toEqual([
      { commitmentId: 'com_abc', token: 'tok-1.with_special' },
      { commitmentId: 'com_def', token: 'tok2' },
    ]);
  });

  it('parses legacy single-entry cookies (no comma)', () => {
    expect(parseReturningCommits('com_abc.tok')).toEqual([
      { commitmentId: 'com_abc', token: 'tok' },
    ]);
  });

  it('returns empty list for unparseable values', () => {
    expect(parseReturningCommits('')).toEqual([]);
    expect(parseReturningCommits(null)).toEqual([]);
    expect(parseReturningCommits('justone')).toEqual([]);
  });

  it('skips entries with invalid commitment id prefix', () => {
    expect(parseReturningCommits('par_abc.tok,com_ok.tok2')).toEqual([
      { commitmentId: 'com_ok', token: 'tok2' },
    ]);
  });

  it('appends a new commit to the front and de-dupes the same id', () => {
    const a = appendReturningCommit(null, 'com_a', 'ta');
    const ab = appendReturningCommit(a, 'com_b', 'tb');
    expect(parseReturningCommits(ab).map((c) => c.commitmentId)).toEqual(['com_b', 'com_a']);

    // re-appending the same id replaces the prior token (e.g. token rotation)
    const aab = appendReturningCommit(ab, 'com_a', 'ta2');
    expect(parseReturningCommits(aab)).toEqual([
      { commitmentId: 'com_a', token: 'ta2' },
      { commitmentId: 'com_b', token: 'tb' },
    ]);
  });

  it('removes a single commit, leaving the rest', () => {
    const start = serializeReturningCommits([
      { commitmentId: 'com_a', token: 'ta' },
      { commitmentId: 'com_b', token: 'tb' },
      { commitmentId: 'com_c', token: 'tc' },
    ]);
    const after = removeReturningCommit(start, 'com_b');
    expect(parseReturningCommits(after).map((c) => c.commitmentId)).toEqual(['com_a', 'com_c']);
  });
});
