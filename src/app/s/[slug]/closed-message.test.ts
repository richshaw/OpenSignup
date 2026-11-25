import { describe, expect, it } from 'vitest';
import { OTHER_LOCALE } from '@/i18n/testing/locales';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { closedMessage } from './closed-message';

const t = getTestTranslator('participant.errors');

describe('closedMessage', () => {
  it('rephrases a closed for participants on the sign-up dialog', () => {
    expect(closedMessage({ code: 'closed' }, 'join', t)).toStrictEqual({
      message: 'No one new can sign up for this slot now.',
      suggestion: "Reload the page to see what's still open.",
    });
  });

  it('says what to keep on the edit page, where only more spots are refused', () => {
    expect(closedMessage({ code: 'closed' }, 'change', t)).toStrictEqual({
      message: "You can't add more spots now.",
      suggestion: 'Keep the number you have.',
    });
  });

  it('takes its lines from the translator it is given', () => {
    const other = getStandInTranslator(OTHER_LOCALE, 'participant.errors');
    expect(closedMessage({ code: 'closed' }, 'join', other)).toStrictEqual({
      message: `participant.errors.closed.join in ${OTHER_LOCALE}`,
      suggestion: `participant.errors.closed.reload in ${OTHER_LOCALE}`,
    });
    expect(closedMessage({ code: 'closed' }, 'change', other)).toStrictEqual({
      message: `participant.errors.closed.change in ${OTHER_LOCALE}`,
      suggestion: `participant.errors.keepNumber in ${OTHER_LOCALE}`,
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
