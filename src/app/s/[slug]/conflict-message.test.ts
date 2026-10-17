import { describe, expect, it } from 'vitest';
import { ALREADY_SIGNED_UP, conflictMessage } from './conflict-message';

// What `commitToSlot` sends for a second sign-up by the same email.
const alreadyCommitted = {
  code: 'conflict',
  message: 'you already committed to this slot',
  details: { commitmentId: 'com_123' },
};

describe('conflictMessage', () => {
  it('says they are already signed up, and points to the confirmation email', () => {
    expect(conflictMessage(alreadyCommitted)).toStrictEqual({
      message: "You're already signed up for this slot.",
      suggestion: 'Use the link in your confirmation email to change or cancel.',
    });
  });

  // Anyone who knows an email address could otherwise take over that
  // person's sign-up.
  it('never carries the existing commitment, or a link to it', () => {
    const copy = conflictMessage(alreadyCommitted);
    expect(copy).toBe(ALREADY_SIGNED_UP);
    expect(JSON.stringify(copy)).not.toMatch(/com_123|\/c\/|http/);
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(conflictMessage({ code: 'closed' })).toBeNull();
    expect(conflictMessage({ code: 'rate_limited' })).toBeNull();
    expect(conflictMessage({})).toBeNull();
    expect(conflictMessage(null)).toBeNull();
    expect(conflictMessage(undefined)).toBeNull();
  });
});
