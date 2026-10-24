import { describe, expect, it } from 'vitest';
import { closeSignupQuestion, spotCounts } from './spot-counts';

describe('spotCounts', () => {
  it('adds up every slot’s capacity, the spots taken on them and the spots still open', () => {
    const slots = [
      { id: 'slot_a', capacity: 1, status: 'open' },
      { id: 'slot_b', capacity: 8, status: 'open' },
      { id: 'slot_c', capacity: 12, status: 'open' },
    ];
    expect(spotCounts(slots, { slot_a: 1, slot_b: 2 })).toEqual({
      taken: 3,
      total: 21,
      open: 18,
      allSlotsOpen: true,
    });
  });

  it('has no total when any slot has no limit, and nothing open to count when an open one has none', () => {
    const slots = [
      { id: 'slot_a', capacity: 4, status: 'open' },
      { id: 'slot_b', capacity: null, status: 'open' },
    ];
    expect(spotCounts(slots, { slot_a: 1, slot_b: 5 })).toEqual({
      taken: 6,
      total: null,
      open: null,
      allSlotsOpen: true,
    });
  });

  it('leaves a closed slot’s free spots out of the open ones, but not out of the total', () => {
    const slots = [
      { id: 'slot_a', capacity: 5, status: 'open' },
      { id: 'slot_b', capacity: 10, status: 'closed' },
      { id: 'slot_c', capacity: null, status: 'closed' },
    ];
    expect(spotCounts(slots, { slot_a: 2, slot_b: 1 })).toEqual({
      taken: 3,
      total: null,
      open: 3,
      allSlotsOpen: false,
    });
  });

  it('doesn’t let an over-full slot cancel out free spots on another', () => {
    const slots = [
      { id: 'slot_a', capacity: 2, status: 'open' },
      { id: 'slot_b', capacity: 4, status: 'open' },
    ];
    expect(spotCounts(slots, { slot_a: 3, slot_b: 1 })).toEqual({
      taken: 4,
      total: 6,
      open: 3,
      allSlotsOpen: true,
    });
  });

  it('counts only the signup’s own slots', () => {
    expect(
      spotCounts([{ id: 'slot_a', capacity: 2, status: 'open' }], { slot_a: 1, slot_gone: 3 }),
    ).toEqual({ taken: 1, total: 2, open: 1, allSlotsOpen: true });
  });

  it('is nothing of nothing with no slots', () => {
    expect(spotCounts([], {})).toEqual({ taken: 0, total: 0, open: 0, allSlotsOpen: true });
  });
});

describe('closeSignupQuestion', () => {
  const after = ' People can’t sign up after this, and you can’t reopen it.';

  it('says nobody has signed up yet when no spot is taken', () => {
    expect(closeSignupQuestion({ taken: 0, total: 21, open: 21, allSlotsOpen: true })).toBe(
      `Nobody has signed up yet.${after}`,
    );
    expect(closeSignupQuestion({ taken: 0, total: null, open: null, allSlotsOpen: true })).toBe(
      `Nobody has signed up yet.${after}`,
    );
  });

  it('says how many spots are still open when every open slot has a limit', () => {
    expect(closeSignupQuestion({ taken: 3, total: 21, open: 18, allSlotsOpen: true })).toBe(
      `18 of 21 spots are still open.${after}`,
    );
    expect(closeSignupQuestion({ taken: 20, total: 21, open: 1, allSlotsOpen: true })).toBe(
      `1 of 21 spots is still open.${after}`,
    );
    expect(closeSignupQuestion({ taken: 21, total: 21, open: 0, allSlotsOpen: true })).toBe(
      `Every spot is taken.${after}`,
    );
  });

  it('goes by the open spots, not the total less those taken', () => {
    // A closed slot with free spots, or an over-full one, makes them differ.
    expect(closeSignupQuestion({ taken: 4, total: 21, open: 3, allSlotsOpen: false })).toBe(
      `3 of 21 spots are still open.${after}`,
    );
    // A closed slot with no limit leaves no total to count against.
    expect(closeSignupQuestion({ taken: 3, total: null, open: 3, allSlotsOpen: false })).toBe(
      `3 spots are still open.${after}`,
    );
    expect(closeSignupQuestion({ taken: 3, total: null, open: 1, allSlotsOpen: false })).toBe(
      `1 spot is still open.${after}`,
    );
  });

  it('says every spot is taken only when every slot is open and full', () => {
    const question = (
      slots: { id: string; capacity: number; status: string }[],
      taken: Record<string, number>,
    ) => closeSignupQuestion(spotCounts(slots, taken));
    expect(
      question(
        [
          { id: 'slot_a', capacity: 2, status: 'open' },
          { id: 'slot_b', capacity: 3, status: 'open' },
        ],
        { slot_a: 2, slot_b: 3 },
      ),
    ).toBe(`Every spot is taken.${after}`);
    // An over-full slot makes up the count, but the closed slot has free spots.
    expect(
      question(
        [
          { id: 'slot_a', capacity: 2, status: 'open' },
          { id: 'slot_b', capacity: 1, status: 'closed' },
        ],
        { slot_a: 3 },
      ),
    ).toBe(`No spots are open.${after}`);
    // Full, but one slot is closed.
    expect(
      question(
        [
          { id: 'slot_a', capacity: 2, status: 'open' },
          { id: 'slot_b', capacity: 1, status: 'closed' },
        ],
        { slot_a: 2, slot_b: 1 },
      ),
    ).toBe(`No spots are open.${after}`);
  });

  it('says how many spots are taken when an open slot has no limit', () => {
    expect(closeSignupQuestion({ taken: 3, total: null, open: null, allSlotsOpen: true })).toBe(
      `3 spots are taken.${after}`,
    );
    expect(closeSignupQuestion({ taken: 1, total: null, open: null, allSlotsOpen: true })).toBe(
      `1 spot is taken.${after}`,
    );
  });
});
