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
    const a = appendReturningCommit(null, 'com_a', 'ta', 'sig_x');
    const ab = appendReturningCommit(a, 'com_b', 'tb', 'sig_x');
    expect(parseReturningCommits(ab).map((c) => c.commitmentId)).toEqual(['com_b', 'com_a']);

    // re-appending the same id replaces the prior token (e.g. token rotation)
    const aab = appendReturningCommit(ab, 'com_a', 'ta2', 'sig_x');
    expect(parseReturningCommits(aab)).toEqual([
      { commitmentId: 'com_a', token: 'ta2', signupId: 'sig_x' },
      { commitmentId: 'com_b', token: 'tb', signupId: 'sig_x' },
    ]);
  });

  it('appends without signupId for callers that omit it', () => {
    const next = appendReturningCommit(null, 'com_a', 'ta');
    expect(parseReturningCommits(next)).toEqual([{ commitmentId: 'com_a', token: 'ta' }]);
  });

  it('removes a single commit, leaving the rest', () => {
    const start = serializeReturningCommits([
      { commitmentId: 'com_a', token: 'ta', signupId: 'sig_x' },
      { commitmentId: 'com_b', token: 'tb', signupId: 'sig_x' },
      { commitmentId: 'com_c', token: 'tc', signupId: 'sig_y' },
    ]);
    const after = removeReturningCommit(start, 'com_b');
    expect(parseReturningCommits(after).map((c) => c.commitmentId)).toEqual(['com_a', 'com_c']);
  });

  it('mixes legacy and new entries in one cookie', () => {
    const value = 'com_old.tokOld,com_new.tokNew.sig_z';
    expect(parseReturningCommits(value)).toEqual([
      { commitmentId: 'com_old', token: 'tokOld' },
      { commitmentId: 'com_new', token: 'tokNew', signupId: 'sig_z' },
    ]);
  });
});
