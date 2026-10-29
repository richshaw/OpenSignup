import { describe, expect, it } from 'vitest';
import { slotActionLabels, slotRowLabel, takenText } from './slotRow';

describe('slotRowLabel', () => {
  const none = { anchor: '', time: false, prompt: null, count: '0 of 6 taken' };

  it('names the row by its first field, then the spots taken', () => {
    expect(slotRowLabel({ ...none, anchor: 'Surfing' })).toBe('Edit slot — Surfing, 0 of 6 taken');
    expect(slotRowLabel({ ...none, anchor: '9:00\u00a0AM', time: true })).toBe(
      'Edit slot at 9:00\u00a0AM, 0 of 6 taken',
    );
    expect(slotRowLabel({ ...none, prompt: 'Set a date' })).toBe(
      'Edit slot — Set a date, 0 of 6 taken',
    );
    expect(slotRowLabel({ ...none, count: '2 taken' })).toBe('Edit slot, 2 taken');
  });

  it('says nothing about a TBD the slot holds', () => {
    expect(slotRowLabel({ ...none, anchor: 'Cashier TBD' })).toBe(
      'Edit slot — Cashier TBD, 0 of 6 taken',
    );
  });
});

describe('slotActionLabels', () => {
  it('names the toolbar and the open editor for the slot, as the row is named', () => {
    expect(slotActionLabels({ anchor: 'Cupcakes', time: false, prompt: null })).toEqual({
      edit: 'Edit slot — Cupcakes',
      duplicate: 'Duplicate slot — Cupcakes',
      delete: 'Delete slot — Cupcakes',
      editing: 'Editing slot — Cupcakes',
    });
    expect(slotActionLabels({ anchor: '9:00\u00a0AM', time: true, prompt: null }).delete).toBe(
      'Delete slot at 9:00\u00a0AM',
    );
    expect(slotActionLabels({ anchor: '', time: false, prompt: 'Set a date' }).delete).toBe(
      'Delete slot — Set a date',
    );
    expect(slotActionLabels({ anchor: '', time: false, prompt: null }).duplicate).toBe(
      'Duplicate slot',
    );
  });
});

describe('takenText', () => {
  it('counts the spots taken, out of the limit when there is one', () => {
    expect(takenText(0, 6)).toBe('0 of 6 taken');
    expect(takenText(2, null)).toBe('2 taken');
  });
});
