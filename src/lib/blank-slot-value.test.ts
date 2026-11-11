import { describe, expect, it } from 'vitest';
import { isBlankSlotValue } from './blank-slot-value';

describe('isBlankSlotValue', () => {
  it.each([undefined, null, '', ' ', '   ', '\t\n'])('counts %j as blank', (v) => {
    expect(isBlankSlotValue(v)).toBe(true);
  });

  it.each(['a', ' Snacks ', 0, 12, false])('counts %j as a value', (v) => {
    expect(isBlankSlotValue(v)).toBe(false);
  });
});
