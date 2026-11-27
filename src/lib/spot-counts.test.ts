import { describe, expect, it } from 'vitest';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import {
  closeSignupQuestion,
  KEEPS_THEIR_SPOT,
  spotCounts,
  spotsLeft,
  spotsTakenLine,
} from './spot-counts';

const close = getTestTranslator('organizer.signup.close');
const spots = getTestTranslator('organizer.signup.spots');

describe('spotsLeft', () => {
  it('has no number when the slot has no limit', () => {
    expect(spotsLeft(null, 0)).toBeNull();
    expect(spotsLeft(null, 7)).toBeNull();
  });

  it('is the capacity less the places taken while there is room', () => {
    expect(spotsLeft(5, 0)).toBe(5);
    expect(spotsLeft(5, 2)).toBe(3);
  });

  it('is 0 when the slot is exactly full', () => {
    expect(spotsLeft(5, 5)).toBe(0);
  });

  it('is 0, never below, when the slot holds more than its capacity', () => {
    expect(spotsLeft(3, 5)).toBe(0);
  });

  it('is 0 for a capacity of 0', () => {
    expect(spotsLeft(0, 0)).toBe(0);
  });
});

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
  const after = " People can't sign up until you reopen it.";
  const kept = `${after} Everyone already signed up keeps their spot.`;

  it('says nobody has signed up yet when no spot is taken', () => {
    expect(closeSignupQuestion({ taken: 0, total: 21, open: 21, allSlotsOpen: true }, close)).toBe(
      `Nobody has signed up yet.${after}`,
    );
    expect(
      closeSignupQuestion({ taken: 0, total: null, open: null, allSlotsOpen: true }, close),
    ).toBe(`Nobody has signed up yet.${after}`);
  });

  it('says how many spots are still open when every open slot has a limit', () => {
    expect(closeSignupQuestion({ taken: 3, total: 21, open: 18, allSlotsOpen: true }, close)).toBe(
      `18 of 21 spots are still open.${kept}`,
    );
    expect(closeSignupQuestion({ taken: 20, total: 21, open: 1, allSlotsOpen: true }, close)).toBe(
      `1 of 21 spots is still open.${kept}`,
    );
    expect(closeSignupQuestion({ taken: 21, total: 21, open: 0, allSlotsOpen: true }, close)).toBe(
      `Every spot is taken.${kept}`,
    );
  });

  it('goes by the open spots, not the total less those taken', () => {
    // A closed slot with free spots, or an over-full one, makes them differ.
    expect(closeSignupQuestion({ taken: 4, total: 21, open: 3, allSlotsOpen: false }, close)).toBe(
      `3 of 21 spots are still open.${kept}`,
    );
    // A closed slot with no limit leaves no total to count against.
    expect(
      closeSignupQuestion({ taken: 3, total: null, open: 3, allSlotsOpen: false }, close),
    ).toBe(`3 spots are still open.${kept}`);
    expect(
      closeSignupQuestion({ taken: 3, total: null, open: 1, allSlotsOpen: false }, close),
    ).toBe(`1 spot is still open.${kept}`);
  });

  it('says every spot is taken only when every slot is open and full', () => {
    const question = (
      slots: { id: string; capacity: number; status: string }[],
      taken: Record<string, number>,
    ) => closeSignupQuestion(spotCounts(slots, taken), close);
    expect(
      question(
        [
          { id: 'slot_a', capacity: 2, status: 'open' },
          { id: 'slot_b', capacity: 3, status: 'open' },
        ],
        { slot_a: 2, slot_b: 3 },
      ),
    ).toBe(`Every spot is taken.${kept}`);
    // An over-full slot makes up the count, but the closed slot has free spots.
    expect(
      question(
        [
          { id: 'slot_a', capacity: 2, status: 'open' },
          { id: 'slot_b', capacity: 1, status: 'closed' },
        ],
        { slot_a: 3 },
      ),
    ).toBe(`No spots are open.${kept}`);
    // Full, but one slot is closed.
    expect(
      question(
        [
          { id: 'slot_a', capacity: 2, status: 'open' },
          { id: 'slot_b', capacity: 1, status: 'closed' },
        ],
        { slot_a: 2, slot_b: 1 },
      ),
    ).toBe(`No spots are open.${kept}`);
  });

  it('says how many spots are taken when an open slot has no limit', () => {
    expect(
      closeSignupQuestion({ taken: 3, total: null, open: null, allSlotsOpen: true }, close),
    ).toBe(`3 spots are taken.${kept}`);
    expect(
      closeSignupQuestion({ taken: 1, total: null, open: null, allSlotsOpen: true }, close),
    ).toBe(`1 spot is taken.${kept}`);
  });
});

describe('spotsTakenLine', () => {
  const counts = (taken: number, total: number | null) => ({
    taken,
    total,
    open: total === null ? null : Math.max(0, total - taken),
    allSlotsOpen: true,
  });

  it('counts the spots taken of all of them when every slot has a limit', () => {
    expect(spotsTakenLine(counts(0, 21), 'open', spots)).toBe('0 of 21 spots taken');
    expect(spotsTakenLine(counts(3, 21), 'open', spots)).toBe('3 of 21 spots taken');
    expect(spotsTakenLine(counts(21, 21), 'open', spots)).toBe('21 of 21 spots taken');
  });

  it('says spot, not spots, of one', () => {
    expect(spotsTakenLine(counts(0, 1), 'open', spots)).toBe('0 of 1 spot taken');
    expect(spotsTakenLine(counts(1, 1), 'open', spots)).toBe('1 of 1 spot taken');
  });

  it('counts only the spots taken when a slot has no limit', () => {
    expect(spotsTakenLine(counts(0, null), 'open', spots)).toBe('0 spots taken');
    expect(spotsTakenLine(counts(1, null), 'open', spots)).toBe('1 spot taken');
    expect(spotsTakenLine(counts(3, null), 'open', spots)).toBe('3 spots taken');
  });

  it('counts only the spots taken when there are no slots to count against', () => {
    expect(spotsTakenLine(counts(0, 0), 'open', spots)).toBe('0 spots taken');
  });

  it('says what it counts when an organizer lowered a slot below its sign-ups', () => {
    expect(spotsTakenLine(counts(5, 4), 'open', spots)).toBe('5 of 4 spots taken');
  });

  it('says first that a closed or archived signup has stopped taking sign-ups', () => {
    expect(spotsTakenLine(counts(3, 21), 'closed', spots)).toBe('Closed · 3 of 21 spots taken');
    expect(spotsTakenLine(counts(1, null), 'closed', spots)).toBe('Closed · 1 spot taken');
    expect(spotsTakenLine(counts(3, 21), 'archived', spots)).toBe('Archived · 3 of 21 spots taken');
  });
});

describe('in the organizer’s language', () => {
  const counts = { taken: 1234, total: 5678, open: 4444, allSlotsOpen: true };

  it('writes counts without grouping, as the English always has', () => {
    expect(closeSignupQuestion(counts, close)).toMatch(/^4444 of 5678 spots are still open\./);
    expect(spotsTakenLine(counts, 'open', spots)).toBe('1234 of 5678 spots taken');
  });

  it('closes with the closed box’s words and the help page’s', () => {
    const closed = getTestTranslator('organizer.signup.closed');
    expect(closeSignupQuestion(counts, close).endsWith(` ${KEEPS_THEIR_SPOT}`)).toBe(true);
    expect(closed('body').endsWith(` ${KEEPS_THEIR_SPOT}`)).toBe(true);
  });

  it.each(TEST_LOCALES)('asks the catalog in %s for the question and the count', (locale) => {
    expect(
      closeSignupQuestion(counts, getStandInTranslator(locale, 'organizer.signup.close')),
    ).toBe(`organizer.signup.close.question in ${locale}`);
    expect(
      spotsTakenLine(counts, 'closed', getStandInTranslator(locale, 'organizer.signup.spots')),
    ).toBe(`organizer.signup.spots.line in ${locale}`);
  });
});
