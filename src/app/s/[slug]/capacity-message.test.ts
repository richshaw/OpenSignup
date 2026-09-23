import { describe, expect, it } from 'vitest';
import { capacityMessage } from './capacity-message';

const full = (remaining: unknown, requested: unknown, alternatives?: unknown) => ({
  code: 'capacity_full',
  details: { remaining, requested, alternatives },
});

describe('capacityMessage on the sign-up dialog', () => {
  it('says the slot filled, and to pick another, when there are others', () => {
    expect(capacityMessage(full(0, 1, [{ id: 'slot_2' }]), 'join')).toEqual({
      message: 'Sorry, this slot just filled up.',
      suggestion: 'Pick another slot.',
    });
  });

  // With nothing else open, "Pick another slot." would point at nothing.
  it('says only that the slot filled when there is no other to pick', () => {
    const filled = { message: 'Sorry, this slot just filled up.' };
    expect(capacityMessage(full(0, 1, []), 'join')).toStrictEqual(filled);
    expect(capacityMessage(full(0, 1), 'join')).toStrictEqual(filled);
    expect(capacityMessage(full(0, 1, 'slot_2'), 'join')).toStrictEqual(filled);
  });

  it('uses the singular for one spot', () => {
    expect(capacityMessage(full(1, 2), 'join')).toEqual({
      message: 'Only 1 spot is left, and you asked for 2.',
      suggestion: 'Ask for 1 instead.',
    });
  });

  it('uses the plural for several spots', () => {
    expect(capacityMessage(full(3, 5), 'join')).toEqual({
      message: 'Only 3 spots are left, and you asked for 5.',
      suggestion: 'Ask for 3 or fewer.',
    });
  });
});

describe('capacityMessage on the edit page', () => {
  // The case that read wrong as "only 1 left": the one spot is already theirs.
  it('says how many this commitment can hold, not how many are left', () => {
    expect(capacityMessage(full(1, 3), 'change')).toEqual({
      message: 'You can have at most 1 spot on this slot, and you asked for 3.',
      suggestion: 'Keep your 1 spot.',
    });
  });

  it('uses the plural for several spots', () => {
    expect(capacityMessage(full(4, 6), 'change')).toEqual({
      message: 'You can have at most 4 spots on this slot, and you asked for 6.',
      suggestion: 'Ask for 4 or fewer.',
    });
  });

  it('says the slot is full when there is no room at all', () => {
    const copy = {
      message: "This slot is full, so you can't add more spots.",
      suggestion: 'Keep the number you have.',
    };
    expect(capacityMessage(full(0, 2), 'change')).toEqual(copy);
    expect(capacityMessage(full(-1, 2), 'change')).toEqual(copy);
  });
});

describe('capacityMessage fallbacks', () => {
  it('returns null for other error codes', () => {
    expect(
      capacityMessage({ code: 'closed', details: { remaining: 1, requested: 2 } }, 'join'),
    ).toBeNull();
    expect(capacityMessage({ code: 'invalid_input' }, 'change')).toBeNull();
  });

  it('returns null without an error', () => {
    expect(capacityMessage(null, 'join')).toBeNull();
    expect(capacityMessage(undefined, 'change')).toBeNull();
  });

  it('returns null when details or its numbers are missing', () => {
    expect(capacityMessage({ code: 'capacity_full' }, 'join')).toBeNull();
    expect(capacityMessage({ code: 'capacity_full', details: {} }, 'join')).toBeNull();
    expect(
      capacityMessage({ code: 'capacity_full', details: { remaining: 1 } }, 'change'),
    ).toBeNull();
    expect(
      capacityMessage({ code: 'capacity_full', details: { requested: 2 } }, 'change'),
    ).toBeNull();
  });

  it('returns null when the numbers are not numbers', () => {
    expect(capacityMessage(full('1', 2), 'join')).toBeNull();
    expect(capacityMessage(full(1, '2'), 'change')).toBeNull();
    expect(capacityMessage(full(null, 2), 'join')).toBeNull();
    expect(capacityMessage(full(Number.NaN, 2), 'join')).toBeNull();
  });
});
