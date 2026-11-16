import { describe, expect, it } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { closedMessage } from './closed-message';
import { conflictMessage } from './conflict-message';
import { goneMessage } from './gone-message';
import { nameMessage } from './name-message';
import { errorCopyText, participantErrorCopy } from './participant-error';

const t = getTestTranslator('participant.errors');

describe('participantErrorCopy', () => {
  it('words a capacity error for the page it is on', () => {
    const error = { code: 'capacity_full', details: { remaining: 2, requested: 3 } };
    expect(participantErrorCopy(error, 'join', t)?.message).toBe(
      'Only 2 spots are left, and you asked for 3.',
    );
    expect(participantErrorCopy(error, 'change', t)?.message).toBe(
      'You can have at most 2 spots on this slot, and you asked for 3.',
    );
  });

  it('gives closed and removed their own copy on both pages', () => {
    const closed = { code: 'closed' };
    const gone = { code: 'not_found' };
    expect(participantErrorCopy(closed, 'join', t)).toEqual(closedMessage(closed, 'join', t));
    expect(participantErrorCopy(closed, 'change', t)).toEqual(closedMessage(closed, 'change', t));
    expect(participantErrorCopy(closed, 'join', t)).not.toEqual(
      participantErrorCopy(closed, 'change', t),
    );
    expect(participantErrorCopy(gone, 'join', t)).toEqual(goneMessage(gone, t));
    expect(participantErrorCopy(gone, 'change', t)).toEqual(goneMessage(gone, t));
  });

  it('words a refused name on both pages', () => {
    const error = { code: 'invalid_input', field: 'name', message: 'name is required' };
    expect(participantErrorCopy(error, 'join', t)).toEqual(nameMessage(error, t));
    expect(participantErrorCopy(error, 'change', t)).toEqual(nameMessage(error, t));
    expect(participantErrorCopy({ code: 'invalid_input', field: 'notes' }, 'join', t)).toBeNull();
  });

  it('rewords a repeat sign-up and the rate limit only when signing up', () => {
    const conflict = { code: 'conflict' };
    expect(participantErrorCopy(conflict, 'join', t)).toEqual(conflictMessage(conflict, t));
    expect(participantErrorCopy({ code: 'rate_limited' }, 'join', t)?.message).toBe(
      'Too many tries just now.',
    );
    expect(participantErrorCopy(conflict, 'change', t)).toBeNull();
    expect(participantErrorCopy({ code: 'rate_limited' }, 'change', t)).toBeNull();
  });

  it('leaves any other error to the server', () => {
    expect(participantErrorCopy({ code: 'invalid_input' }, 'join', t)).toBeNull();
    expect(participantErrorCopy(null, 'change', t)).toBeNull();
  });

  // The same code runs in the dialog and on the edit page, each with the
  // translator its page's language gives it.
  it('hands the translator it is given to every helper', () => {
    const sv = getStandInTranslator('sv', 'participant.errors');
    const say = (key: string) => `participant.errors.${key} in sv`;
    const capacity = { code: 'capacity_full', details: { remaining: 2, requested: 3 } };
    expect(participantErrorCopy(capacity, 'join', sv)?.message).toBe(say('capacity.onlyLeft'));
    expect(participantErrorCopy({ code: 'closed' }, 'change', sv)?.message).toBe(
      say('closed.change'),
    );
    expect(participantErrorCopy({ code: 'not_found' }, 'join', sv)?.message).toBe(
      say('gone.message'),
    );
    expect(
      participantErrorCopy({ code: 'invalid_input', field: 'name' }, 'change', sv)?.message,
    ).toBe(say('name'));
    expect(participantErrorCopy({ code: 'conflict' }, 'join', sv)?.message).toBe(
      say('conflict.message'),
    );
    expect(participantErrorCopy({ code: 'rate_limited' }, 'join', sv)?.message).toBe(
      say('rateLimit.message'),
    );
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
