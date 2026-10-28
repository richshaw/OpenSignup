import { describe, expect, it } from 'vitest';
import { slotRowLabel } from './slotRow';

describe('slotRowLabel', () => {
  const none = { anchor: '', time: false, prompt: null };

  it('names the row by its first field, as before', () => {
    expect(slotRowLabel({ ...none, anchor: 'Surfing' })).toBe('Edit slot — Surfing');
    expect(slotRowLabel({ ...none, anchor: '9:00\u00a0AM', time: true })).toBe(
      'Edit slot at 9:00\u00a0AM',
    );
    expect(slotRowLabel({ ...none, prompt: 'Set a date' })).toBe('Edit slot — Set a date');
    expect(slotRowLabel(none)).toBe('Edit slot');
  });

  it('says nothing about a TBD the slot holds', () => {
    expect(slotRowLabel({ ...none, anchor: 'Cashier TBD' })).toBe('Edit slot — Cashier TBD');
  });
});
