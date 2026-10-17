import { describe, expect, it } from 'vitest';
import { CLOSED, closedMessage } from './closed-message';

describe('closedMessage', () => {
  it('rephrases a closed for participants, for the sign-up dialog and the edit page', () => {
    expect(closedMessage({ code: 'closed' }, 'join')).toBe(CLOSED.join);
    expect(closedMessage({ code: 'closed' }, 'change')).toBe(CLOSED.change);
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(closedMessage({ code: 'not_found' }, 'join')).toBeNull();
    expect(closedMessage({ code: 'capacity_full' }, 'change')).toBeNull();
    expect(closedMessage({}, 'join')).toBeNull();
    expect(closedMessage(null, 'change')).toBeNull();
    expect(closedMessage(undefined, 'join')).toBeNull();
  });
});
