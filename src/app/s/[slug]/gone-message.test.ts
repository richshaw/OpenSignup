import { describe, expect, it } from 'vitest';
import { GONE, goneMessage } from './gone-message';

describe('goneMessage', () => {
  it('rephrases a not_found for participants', () => {
    expect(goneMessage({ code: 'not_found' })).toBe(GONE);
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(goneMessage({ code: 'closed' })).toBeNull();
    expect(goneMessage({ code: 'capacity_full' })).toBeNull();
    expect(goneMessage({})).toBeNull();
    expect(goneMessage(null)).toBeNull();
    expect(goneMessage(undefined)).toBeNull();
  });
});
