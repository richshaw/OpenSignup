import { describe, expect, it } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { getTranslator } from '@/i18n/translator';
import { closedMessage } from './closed-message';
import { conflictMessage } from './conflict-message';
import { goneMessage } from './gone-message';
import { inputMessage } from './input-message';
import { errorCopyText, participantErrorCopy, type ErrorContext } from './participant-error';

const t = getTestTranslator('participant.errors');
/** The Swedish catalog, failing the test on a missing key. */
const sv = getTranslator('sv', 'participant.errors', {
  onError: (error) => {
    throw error;
  },
});

const CONTEXTS = ['join', 'save', 'cancel'] as const satisfies readonly ErrorContext[];

const FAILED = {
  join: "Something went wrong, so you're not signed up yet. Try again.",
  save: "Something went wrong, so your changes weren't saved. Try again.",
  cancel: "Something went wrong, so your spot wasn't cancelled. Try again.",
};

/**
 * Text no copy could hold, in every place the server puts its own words, so a
 * test can tell whether any of it reached the page.
 */
const SERVER_WORDS = 'SERVER-ONLY-ENGLISH';
const fromServer = (error: { code: string; details?: Record<string, unknown> }) => ({
  ...error,
  message: SERVER_WORDS,
  suggestion: SERVER_WORDS,
});

describe('participantErrorCopy', () => {
  it('words a capacity error for the page it is on', () => {
    const error = { code: 'capacity_full', details: { remaining: 2, requested: 3 } };
    expect(participantErrorCopy(error, 'join', t).message).toBe(
      'Only 2 spots are left, and you asked for 3.',
    );
    expect(participantErrorCopy(error, 'save', t).message).toBe(
      'You can have at most 2 spots on this slot, and you asked for 3.',
    );
  });

  it('gives closed and removed their own copy on both pages', () => {
    const closed = { code: 'closed' };
    const gone = { code: 'not_found' };
    expect(participantErrorCopy(closed, 'join', t)).toEqual(closedMessage(closed, 'join', t));
    expect(participantErrorCopy(closed, 'save', t)).toEqual(closedMessage(closed, 'change', t));
    expect(participantErrorCopy(closed, 'join', t)).not.toEqual(
      participantErrorCopy(closed, 'save', t),
    );
    for (const context of CONTEXTS) {
      expect(participantErrorCopy(gone, context, t)).toEqual(goneMessage(gone, t));
    }
  });

  it('words a refused input by its reason on both pages', () => {
    for (const reason of ['email_invalid', 'name_required', 'quantity_too_large', undefined]) {
      const error = { code: 'invalid_input', details: { reason } };
      for (const context of CONTEXTS) {
        expect(participantErrorCopy(error, context, t)).toEqual(inputMessage(error, t));
      }
    }
  });

  it('words a repeat sign-up when signing up, and a sign-up it can no longer change on the edit page', () => {
    const conflict = { code: 'conflict' };
    const cantChange = conflictMessage(conflict, 'change', t);
    expect(participantErrorCopy(conflict, 'join', t)).toEqual(conflictMessage(conflict, 'join', t));
    for (const context of ['save', 'cancel'] as const) {
      expect(participantErrorCopy(conflict, context, t)).toEqual(cantChange);
      expect(participantErrorCopy({ code: 'forbidden' }, context, t)).toEqual(cantChange);
    }
  });

  it('words the rate limit on both pages', () => {
    const limited = { code: 'rate_limited', details: { retryAfterSeconds: 3412 } };
    for (const context of CONTEXTS) {
      expect(errorCopyText(participantErrorCopy(limited, context, t))).toBe(
        'Too many tries just now. Try again in about 57 minutes.',
      );
    }
  });

  // Nothing the server says is ever shown, so anything without copy of its
  // own says what didn't happen, and to try again.
  it.each([
    ['an error it has no copy for', { code: 'internal' }],
    ['a code it does not know', { code: 'teapot' }],
    ['a capacity error without its numbers', { code: 'capacity_full' }],
    ['an error with no code', {}],
  ])('says the sign-up, save or cancel failed for %s', (_, error) => {
    for (const context of CONTEXTS) {
      expect(errorCopyText(participantErrorCopy(error, context, t))).toBe(FAILED[context]);
    }
  });

  // Only a move to another slot, which the dialog never asks for, is refused
  // this way when signing up.
  it('says signing up failed for a forbidden', () => {
    expect(errorCopyText(participantErrorCopy({ code: 'forbidden' }, 'join', t))).toBe(FAILED.join);
  });

  it('says the same in Swedish', () => {
    const swedish = (context: ErrorContext) =>
      errorCopyText(participantErrorCopy({ code: 'internal' }, context, sv));
    expect(swedish('join')).toBe('Något gick fel, så du är inte anmäld än. Försök igen.');
    expect(swedish('save')).toBe('Något gick fel, så dina ändringar sparades inte. Försök igen.');
    expect(swedish('cancel')).toBe('Något gick fel, så din anmälan avbokades inte. Försök igen.');
  });

  // Every code the two endpoints send, with the server's words in it.
  it.each([
    { code: 'capacity_full', details: { remaining: 1, requested: 2, alternatives: [] } },
    { code: 'capacity_full' },
    { code: 'closed' },
    { code: 'not_found' },
    { code: 'conflict', details: { status: 'no_show' } },
    { code: 'forbidden' },
    { code: 'rate_limited', details: { retryAfterSeconds: 60 } },
    { code: 'rate_limited' },
    { code: 'invalid_input', details: { reason: 'email_required' } },
    { code: 'invalid_input', details: { reason: 'quantity_not_whole' } },
    { code: 'invalid_input', details: { maxBytes: 1_000_000 } },
    { code: 'internal' },
  ])('never shows the server’s text for $code', (error) => {
    for (const context of CONTEXTS) {
      for (const translator of [t, sv]) {
        const copy = participantErrorCopy(fromServer(error), context, translator);
        expect(copy.message).not.toBe('');
        expect(JSON.stringify(copy)).not.toContain(SERVER_WORDS);
      }
    }
  });

  // The same code runs in the dialog and on the edit page, each with the
  // translator its page's language gives it.
  it('hands the translator it is given to every helper', () => {
    const standIn = getStandInTranslator('sv', 'participant.errors');
    const say = (key: string) => `participant.errors.${key} in sv`;
    const capacity = { code: 'capacity_full', details: { remaining: 2, requested: 3 } };
    const longName = { code: 'invalid_input', details: { reason: 'name_too_long' } };
    expect(participantErrorCopy(capacity, 'join', standIn).message).toBe(say('capacity.onlyLeft'));
    expect(participantErrorCopy({ code: 'closed' }, 'save', standIn).message).toBe(
      say('closed.change'),
    );
    expect(participantErrorCopy({ code: 'not_found' }, 'join', standIn).message).toBe(
      say('gone.message'),
    );
    expect(participantErrorCopy(longName, 'save', standIn).message).toBe(say('name'));
    expect(participantErrorCopy({ code: 'conflict' }, 'join', standIn).message).toBe(
      say('conflict.message'),
    );
    expect(participantErrorCopy({ code: 'conflict' }, 'cancel', standIn).message).toBe(
      say('conflict.change'),
    );
    expect(participantErrorCopy({ code: 'rate_limited' }, 'save', standIn).message).toBe(
      say('rateLimit.message'),
    );
    for (const context of CONTEXTS) {
      expect(participantErrorCopy({ code: 'internal' }, context, standIn)).toStrictEqual({
        message: say(`failed.${context}`),
        suggestion: say('failed.tryAgain'),
      });
    }
  });
});

describe('errorCopyText', () => {
  it('joins the message and suggestion, or gives the message alone', () => {
    const gone = goneMessage({ code: 'not_found' }, t)!;
    expect(errorCopyText(gone)).toBe(
      'Sorry, this is no longer available. Reload the page to see what has changed.',
    );
    expect(errorCopyText({ message: 'Sorry, this slot just filled up.' })).toBe(
      'Sorry, this slot just filled up.',
    );
  });
});
