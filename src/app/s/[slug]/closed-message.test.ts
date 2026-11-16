import { describe, expect, it } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { closedMessage } from './closed-message';

const t = getTestTranslator('participant.errors');

describe('closedMessage', () => {
  it('rephrases a closed for participants on the sign-up dialog', () => {
    expect(closedMessage({ code: 'closed' }, 'join', t)).toStrictEqual({
      message: 'No one new can sign up for this slot now.',
      suggestion: 'Reload the page to see what’s still open.',
    });
  });

  it('says what to keep on the edit page, where only more spots are refused', () => {
    expect(closedMessage({ code: 'closed' }, 'change', t)).toStrictEqual({
      message: "You can't add more spots now.",
      suggestion: 'Keep the number you have.',
    });
  });

  it('takes its lines from the translator it is given', () => {
    const sv = getStandInTranslator('sv', 'participant.errors');
    expect(closedMessage({ code: 'closed' }, 'join', sv)).toStrictEqual({
      message: 'participant.errors.closed.join in sv',
      suggestion: 'participant.errors.closed.reload in sv',
    });
    expect(closedMessage({ code: 'closed' }, 'change', sv)).toStrictEqual({
      message: 'participant.errors.closed.change in sv',
      suggestion: 'participant.errors.keepNumber in sv',
    });
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(closedMessage({ code: 'not_found' }, 'join', t)).toBeNull();
    expect(closedMessage({ code: 'capacity_full' }, 'change', t)).toBeNull();
    expect(closedMessage({}, 'join', t)).toBeNull();
    expect(closedMessage(null, 'change', t)).toBeNull();
    expect(closedMessage(undefined, 'join', t)).toBeNull();
  });
});
