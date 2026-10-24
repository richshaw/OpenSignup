import { describe, expect, it } from 'vitest';
import { closeSignupQuestion, spotCounts } from './spot-counts';

describe('spotCounts', () => {
  it('adds up every slot’s capacity, and the spots taken on them', () => {
    const slots = [
      { id: 'slot_a', capacity: 1 },
      { id: 'slot_b', capacity: 8 },
      { id: 'slot_c', capacity: 12 },
    ];
    expect(spotCounts(slots, { slot_a: 1, slot_b: 2 })).toEqual({ taken: 3, total: 21 });
  });

  it('has no total when any slot has no limit', () => {
    const slots = [
      { id: 'slot_a', capacity: 4 },
      { id: 'slot_b', capacity: null },
    ];
    expect(spotCounts(slots, { slot_a: 1, slot_b: 5 })).toEqual({ taken: 6, total: null });
  });

  it('counts only the signup’s own slots', () => {
    expect(spotCounts([{ id: 'slot_a', capacity: 2 }], { slot_a: 1, slot_gone: 3 })).toEqual({
      taken: 1,
      total: 2,
    });
  });

  it('is nothing of nothing with no slots', () => {
    expect(spotCounts([], {})).toEqual({ taken: 0, total: 0 });
  });
});

describe('closeSignupQuestion', () => {
  const after = ' People can’t sign up after this, and you can’t reopen it.';

  it('says nobody has signed up yet when no spot is taken', () => {
    expect(closeSignupQuestion({ taken: 0, total: 21 })).toBe(`Nobody has signed up yet.${after}`);
    expect(closeSignupQuestion({ taken: 0, total: null })).toBe(
      `Nobody has signed up yet.${after}`,
    );
  });

  it('says how many spots are still open when every slot has a limit', () => {
    expect(closeSignupQuestion({ taken: 3, total: 21 })).toBe(
      `18 of 21 spots are still open.${after}`,
    );
    expect(closeSignupQuestion({ taken: 20, total: 21 })).toBe(
      `1 of 21 spots is still open.${after}`,
    );
    expect(closeSignupQuestion({ taken: 21, total: 21 })).toBe(`Every spot is taken.${after}`);
  });

  it('says how many spots are taken when a slot has no limit', () => {
    expect(closeSignupQuestion({ taken: 3, total: null })).toBe(`3 spots are taken.${after}`);
    expect(closeSignupQuestion({ taken: 1, total: null })).toBe(`1 spot is taken.${after}`);
  });
});
