import { describe, expect, it } from 'vitest';
import { CLOSED, closedMessage } from './closed-message';

describe('closedMessage', () => {
  it('rephrases a closed for participants', () => {
    expect(closedMessage({ code: 'closed' })).toBe(CLOSED);
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(closedMessage({ code: 'not_found' })).toBeNull();
    expect(closedMessage({ code: 'capacity_full' })).toBeNull();
    expect(closedMessage({})).toBeNull();
    expect(closedMessage(null)).toBeNull();
    expect(closedMessage(undefined)).toBeNull();
  });
});
