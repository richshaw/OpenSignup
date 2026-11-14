import { describe, expect, it } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { capacityMessage } from './capacity-message';

const t = getTestTranslator('participant.errors');

const full = (remaining: unknown, requested: unknown, alternatives?: unknown) => ({
  code: 'capacity_full',
  details: { remaining, requested, alternatives },
});

describe('capacityMessage on the sign-up dialog', () => {
  it('says the slot filled, and to pick another, when there are others', () => {
    expect(capacityMessage(full(0, 1, [{ id: 'slot_2' }]), 'join', t)).toEqual({
      message: 'Sorry, this slot just filled up.',
      suggestion: 'Pick another slot.',
    });
  });

  // With nothing else open, "Pick another slot." would point at nothing.
  it('says only that the slot filled when there is no other to pick', () => {
    const filled = { message: 'Sorry, this slot just filled up.' };
    expect(capacityMessage(full(0, 1, []), 'join', t)).toStrictEqual(filled);
    expect(capacityMessage(full(0, 1), 'join', t)).toStrictEqual(filled);
    expect(capacityMessage(full(0, 1, 'slot_2'), 'join', t)).toStrictEqual(filled);
  });

  it('uses the singular for one spot', () => {
    expect(capacityMessage(full(1, 2), 'join', t)).toEqual({
      message: 'Only 1 spot is left, and you asked for 2.',
      suggestion: 'Ask for 1 instead.',
    });
  });

  it('uses the plural for several spots', () => {
    expect(capacityMessage(full(3, 5), 'join', t)).toEqual({
      message: 'Only 3 spots are left, and you asked for 5.',
      suggestion: 'Ask for 3 or fewer.',
    });
  });

  // `${n}` printed no separator, and the catalog's counts keep it that way.
  it('prints a large count without a separator, as before', () => {
    expect(capacityMessage(full(1234, 1500), 'join', t)).toEqual({
      message: 'Only 1234 spots are left, and you asked for 1500.',
      suggestion: 'Ask for 1234 or fewer.',
    });
  });
});

describe('capacityMessage on the edit page', () => {
  // The case that read wrong as "only 1 left": the one spot is already theirs.
  it('says how many this commitment can hold, not how many are left', () => {
    expect(capacityMessage(full(1, 3), 'change', t)).toEqual({
      message: 'You can have at most 1 spot on this slot, and you asked for 3.',
      suggestion: 'Keep your 1 spot.',
    });
  });

  it('uses the plural for several spots', () => {
    expect(capacityMessage(full(4, 6), 'change', t)).toEqual({
      message: 'You can have at most 4 spots on this slot, and you asked for 6.',
      suggestion: 'Ask for 4 or fewer.',
    });
    expect(capacityMessage(full(1234, 1500), 'change', t)?.message).toBe(
      'You can have at most 1234 spots on this slot, and you asked for 1500.',
    );
  });

  it('says the slot is full when there is no room at all', () => {
    const copy = {
      message: "This slot is full, so you can't add more spots.",
      suggestion: 'Keep the number you have.',
    };
    expect(capacityMessage(full(0, 2), 'change', t)).toEqual(copy);
    expect(capacityMessage(full(-1, 2), 'change', t)).toEqual(copy);
  });
});

describe('the counts in the catalog', () => {
  // The helpers never send 0 (they say the slot filled instead), but a
  // translation reads the whole plural, so English reads right at every count.
  it.each([
    [0, 'Only 0 spots are left', 'at most 0 spots'],
    [1, 'Only 1 spot is left', 'at most 1 spot on'],
    [2, 'Only 2 spots are left', 'at most 2 spots'],
  ])('words %i spot(s) as a whole sentence', (remaining, join, change) => {
    expect(t('capacity.onlyLeft', { remaining, requested: 9 })).toBe(
      `${join}, and you asked for 9.`,
    );
    expect(t('capacity.atMost', { remaining, requested: 9 })).toContain(change);
  });
});

describe('capacityMessage in the signup’s language', () => {
  const sv = getStandInTranslator('sv', 'participant.errors');
  const say = (key: string) => `participant.errors.${key} in sv`;

  it('takes every line from the translator it is given', () => {
    expect(capacityMessage(full(0, 1, [{ id: 'slot_2' }]), 'join', sv)).toEqual({
      message: say('capacity.filledUp'),
      suggestion: say('capacity.pickAnother'),
    });
    expect(capacityMessage(full(1, 2), 'join', sv)).toEqual({
      message: say('capacity.onlyLeft'),
      suggestion: say('capacity.askForOne'),
    });
    expect(capacityMessage(full(3, 5), 'join', sv)).toEqual({
      message: say('capacity.onlyLeft'),
      suggestion: say('capacity.askForOrFewer'),
    });
    expect(capacityMessage(full(0, 2), 'change', sv)).toEqual({
      message: say('capacity.full'),
      suggestion: say('keepNumber'),
    });
    expect(capacityMessage(full(1, 3), 'change', sv)).toEqual({
      message: say('capacity.atMost'),
      suggestion: say('capacity.keepYourOne'),
    });
    expect(capacityMessage(full(4, 6), 'change', sv)).toEqual({
      message: say('capacity.atMost'),
      suggestion: say('capacity.askForOrFewer'),
    });
  });
});

describe('capacityMessage fallbacks', () => {
  it('returns null for other error codes', () => {
    expect(
      capacityMessage({ code: 'closed', details: { remaining: 1, requested: 2 } }, 'join', t),
    ).toBeNull();
    expect(capacityMessage({ code: 'invalid_input' }, 'change', t)).toBeNull();
  });

  it('returns null without an error', () => {
    expect(capacityMessage(null, 'join', t)).toBeNull();
    expect(capacityMessage(undefined, 'change', t)).toBeNull();
  });

  it('returns null when details or its numbers are missing', () => {
    expect(capacityMessage({ code: 'capacity_full' }, 'join', t)).toBeNull();
    expect(capacityMessage({ code: 'capacity_full', details: {} }, 'join', t)).toBeNull();
    expect(
      capacityMessage({ code: 'capacity_full', details: { remaining: 1 } }, 'change', t),
    ).toBeNull();
    expect(
      capacityMessage({ code: 'capacity_full', details: { requested: 2 } }, 'change', t),
    ).toBeNull();
  });

  it('returns null when the numbers are not numbers', () => {
    expect(capacityMessage(full('1', 2), 'join', t)).toBeNull();
    expect(capacityMessage(full(1, '2'), 'change', t)).toBeNull();
    expect(capacityMessage(full(null, 2), 'join', t)).toBeNull();
    expect(capacityMessage(full(Number.NaN, 2), 'join', t)).toBeNull();
  });
});
