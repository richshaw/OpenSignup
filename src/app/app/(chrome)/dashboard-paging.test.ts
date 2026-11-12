import { describe, expect, it } from 'vitest';
import { olderSignupsHref, parseBefore, signupCountLabel } from './dashboard-paging';

describe('parseBefore', () => {
  it('takes a signup id', () => {
    expect(parseBefore('sig_0abcXYZ9')).toBe('sig_0abcXYZ9');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['repeated', ['sig_a', 'sig_b']],
    ['another kind of id', 'slot_abc'],
    ['garbled', "sig_abc' or 1=1"],
    ['too long', `sig_${'a'.repeat(41)}`],
  ])('falls back to the first page when %s', (_, raw) => {
    expect(parseBefore(raw)).toBeUndefined();
  });
});

describe('signupCountLabel', () => {
  it('has no line when there are none, since the empty state says so', () => {
    expect(signupCountLabel(0)).toBeNull();
  });

  it('gives the real total, past one page', () => {
    expect(signupCountLabel(1)).toBe('1 total');
    expect(signupCountLabel(201)).toBe('201 total');
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
