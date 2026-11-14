import { describe, expect, it } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { conflictMessage } from './conflict-message';

const t = getTestTranslator('participant.errors');
const sv = getStandInTranslator('sv', 'participant.errors');

// What `commitToSlot` sends for a second sign-up by the same email.
const alreadyCommitted = {
  code: 'conflict',
  message: 'you already committed to this slot',
  details: { commitmentId: 'com_123' },
};

// What the edit link's save or cancel sends for a sign-up that has ended
// some other way than a cancel, and for a link that doesn't open it.
const notActive = {
  code: 'conflict',
  message: 'commitment is not active',
  details: { status: 'no_show' },
};
const badToken = { code: 'forbidden', message: 'invalid edit token' };

describe('conflictMessage', () => {
  it('says they are already signed up, and points to the confirmation email', () => {
    expect(conflictMessage(alreadyCommitted, 'join', t)).toStrictEqual({
      message: "You're already signed up for this slot.",
      suggestion: 'Use the link in your confirmation email to change or cancel.',
    });
  });

  // Anyone who knows an email address could otherwise take over that
  // person's sign-up.
  it('never carries the existing commitment, or a link to it', () => {
    expect(JSON.stringify(conflictMessage(alreadyCommitted, 'join', t))).not.toMatch(
      /com_123|\/c\/|http/,
    );
  });

  it('says on the edit page that the spot can no longer be changed, for an ended sign-up or a refused link', () => {
    const cantChange = {
      message: "This spot can't be changed any more.",
      suggestion: 'Reload the page to see what has changed.',
    };
    expect(conflictMessage(notActive, 'change', t)).toStrictEqual(cantChange);
    expect(conflictMessage(badToken, 'change', t)).toStrictEqual(cantChange);
  });

  it('takes its lines from the translator it is given', () => {
    expect(conflictMessage(alreadyCommitted, 'join', sv)).toStrictEqual({
      message: 'participant.errors.conflict.message in sv',
      suggestion: 'participant.errors.conflict.suggestion in sv',
    });
    expect(conflictMessage(badToken, 'change', sv)).toStrictEqual({
      message: 'participant.errors.conflict.change in sv',
      suggestion: 'participant.errors.gone.suggestion in sv',
    });
  });

  it('leaves every other error, and none, to the caller', () => {
    for (const context of ['join', 'change'] as const) {
      expect(conflictMessage({ code: 'closed' }, context, t)).toBeNull();
      expect(conflictMessage({ code: 'rate_limited' }, context, t)).toBeNull();
      expect(conflictMessage({}, context, t)).toBeNull();
      expect(conflictMessage(null, context, t)).toBeNull();
      expect(conflictMessage(undefined, context, t)).toBeNull();
    }
    // Signing up can only meet a `forbidden` from a move, which the dialog
    // never asks for: it gets the general copy.
    expect(conflictMessage(badToken, 'join', t)).toBeNull();
  });
});
