import { describe, expect, it } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { neighborInGroup, slotActionLabels, slotRowLabel, takenText } from './slotRow';

/** The Build tab's messages in English, from the catalog. */
const t = getTestTranslator('organizer.build');

describe('slotRowLabel', () => {
  const none = { anchor: '', time: false, prompt: null, count: '0 of 6 taken' };

  it('names the row by its first field, then the spots taken', () => {
    expect(slotRowLabel(t, { ...none, anchor: 'Surfing' })).toBe(
      'Edit slot — Surfing, 0 of 6 taken',
    );
    expect(slotRowLabel(t, { ...none, anchor: '9:00\u00a0AM', time: true })).toBe(
      'Edit slot at 9:00\u00a0AM, 0 of 6 taken',
    );
    expect(slotRowLabel(t, { ...none, prompt: 'Set a date' })).toBe(
      'Edit slot — Set a date, 0 of 6 taken',
    );
    expect(slotRowLabel(t, { ...none, count: '2 taken' })).toBe('Edit slot, 2 taken');
  });

  it('says nothing about a TBD the slot holds', () => {
    expect(slotRowLabel(t, { ...none, anchor: 'Cashier TBD' })).toBe(
      'Edit slot — Cashier TBD, 0 of 6 taken',
    );
  });
});

describe('slotActionLabels', () => {
  it('names the toolbar and the open editor for the slot, as the row is named', () => {
    expect(slotActionLabels(t, { anchor: 'Cupcakes', time: false, prompt: null })).toEqual({
      edit: 'Edit slot — Cupcakes',
      duplicate: 'Duplicate slot — Cupcakes',
      delete: 'Delete slot — Cupcakes',
      editing: 'Editing slot — Cupcakes',
    });
    expect(slotActionLabels(t, { anchor: '9:00\u00a0AM', time: true, prompt: null }).delete).toBe(
      'Delete slot at 9:00\u00a0AM',
    );
    expect(slotActionLabels(t, { anchor: '', time: false, prompt: 'Set a date' }).delete).toBe(
      'Delete slot — Set a date',
    );
    expect(slotActionLabels(t, { anchor: '', time: false, prompt: null }).duplicate).toBe(
      'Duplicate slot',
    );
  });
});

describe('takenText', () => {
  it('counts the spots taken, out of the limit when there is one', () => {
    expect(takenText(t, 0, 6)).toBe('0 of 6 taken');
    expect(takenText(t, 2, null)).toBe('2 taken');
  });
});

describe('in the organizer’s language', () => {
  const swedish = getStandInTranslator('sv', 'organizer.build');

  it('takes each name and count from the catalog', () => {
    expect(slotActionLabels(swedish, { anchor: 'Bullar', time: false, prompt: null })).toEqual({
      edit: 'organizer.build.slot.edit in sv',
      duplicate: 'organizer.build.slot.duplicate in sv',
      delete: 'organizer.build.slot.delete in sv',
      editing: 'organizer.build.slot.editing in sv',
    });
    expect(slotRowLabel(swedish, { anchor: '', time: false, prompt: null, count: '2 taken' })).toBe(
      'organizer.build.slot.row in sv',
    );
    expect(takenText(swedish, 2, null)).toBe('organizer.build.slot.taken in sv');
    expect(takenText(swedish, 2, 6)).toBe('organizer.build.slot.takenOf in sv');
  });

  it('counts past a thousand as English always printed it, with no separator', () => {
    expect(takenText(t, 1234, 2000)).toBe('1234 of 2000 taken');
  });
});

describe('neighborInGroup', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('names the slot before or after it', () => {
    expect(neighborInGroup(rows, 'b', 'up')).toBe('a');
    expect(neighborInGroup(rows, 'b', 'down')).toBe('c');
  });

  it('gives null at the ends of the group', () => {
    expect(neighborInGroup(rows, 'a', 'up')).toBeNull();
    expect(neighborInGroup(rows, 'c', 'down')).toBeNull();
    expect(neighborInGroup([{ id: 'a' }], 'a', 'down')).toBeNull();
  });

  it('gives null for a slot not in the group', () => {
    expect(neighborInGroup(rows, 'z', 'up')).toBeNull();
  });
});
