import { describe, expect, it } from 'vitest';
import { WORKSPACE_LIST_LIMIT } from '@/schemas/signups';
import {
  newerSignupsHref,
  olderSignupsHref,
  parseCursor,
  signupRangeLabel,
} from './dashboard-paging';

describe('parseCursor', () => {
  it('takes a signup id as before or after', () => {
    expect(parseCursor({ before: 'sig_0abcXYZ9' })).toEqual({ before: 'sig_0abcXYZ9' });
    expect(parseCursor({ after: 'sig_0abcXYZ9' })).toEqual({ after: 'sig_0abcXYZ9' });
  });

  it('prefers before when both come', () => {
    expect(parseCursor({ before: 'sig_a', after: 'sig_b' })).toEqual({ before: 'sig_a' });
  });

  it('uses after when before is unusable', () => {
    expect(parseCursor({ before: 'nope', after: 'sig_b' })).toEqual({ after: 'sig_b' });
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['repeated', ['sig_a', 'sig_b']],
    ['another kind of id', 'slot_abc'],
    ['garbled', "sig_abc' or 1=1"],
    ['too long', `sig_${'a'.repeat(41)}`],
  ])('falls back to the first page when %s', (_, raw) => {
    expect(parseCursor({ before: raw })).toBeNull();
    expect(parseCursor({ after: raw })).toBeNull();
  });
});

describe('signupRangeLabel', () => {
  it('says which signups the page shows, out of how many', () => {
    expect(signupRangeLabel(0, 200, 210)).toBe('1–200 of 210');
    expect(signupRangeLabel(200, 10, 210)).toBe('201–210 of 210');
  });

  it('never says fewer in all than it shows', () => {
    expect(signupRangeLabel(200, 10, 205)).toBe('201–210 of 210');
  });
});

describe('olderSignupsHref', () => {
  it('links to the next page when there is one', () => {
    expect(olderSignupsHref('sig_abc')).toBe('/app?before=sig_abc');
  });

  it('is null on the last page', () => {
    expect(olderSignupsHref(null)).toBeNull();
  });
});

describe('newerSignupsHref', () => {
  it('is null on the first page', () => {
    expect(newerSignupsHref(null, 0)).toBeNull();
  });

  it('goes to plain /app when the newer page is the first one', () => {
    expect(newerSignupsHref('sig_abc', WORKSPACE_LIST_LIMIT)).toBe('/app');
    expect(newerSignupsHref('sig_abc', 3)).toBe('/app');
  });

  it('links to the page before this one further in', () => {
    expect(newerSignupsHref('sig_abc', WORKSPACE_LIST_LIMIT * 2)).toBe('/app?after=sig_abc');
  });
});
