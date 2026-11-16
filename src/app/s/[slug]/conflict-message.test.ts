import { describe, expect, it } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { conflictMessage } from './conflict-message';

const t = getTestTranslator('participant.errors');

// What `commitToSlot` sends for a second sign-up by the same email.
const alreadyCommitted = {
  code: 'conflict',
  message: 'you already committed to this slot',
  details: { commitmentId: 'com_123' },
};

describe('conflictMessage', () => {
  it('says they are already signed up, and points to the confirmation email', () => {
    expect(conflictMessage(alreadyCommitted, t)).toStrictEqual({
      message: "You're already signed up for this slot.",
      suggestion: 'Use the link in your confirmation email to change or cancel.',
    });
  });

  // Anyone who knows an email address could otherwise take over that
  // person's sign-up.
  it('never carries the existing commitment, or a link to it', () => {
    expect(JSON.stringify(conflictMessage(alreadyCommitted, t))).not.toMatch(/com_123|\/c\/|http/);
  });

  it('takes its lines from the translator it is given', () => {
    expect(
      conflictMessage(alreadyCommitted, getStandInTranslator('sv', 'participant.errors')),
    ).toStrictEqual({
      message: 'participant.errors.conflict.message in sv',
      suggestion: 'participant.errors.conflict.suggestion in sv',
    });
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(conflictMessage({ code: 'closed' }, t)).toBeNull();
    expect(conflictMessage({ code: 'rate_limited' }, t)).toBeNull();
    expect(conflictMessage({}, t)).toBeNull();
    expect(conflictMessage(null, t)).toBeNull();
    expect(conflictMessage(undefined, t)).toBeNull();
  });
});
