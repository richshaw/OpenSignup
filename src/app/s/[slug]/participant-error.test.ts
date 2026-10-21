import { describe, expect, it } from 'vitest';
import { ALREADY_SIGNED_UP } from './conflict-message';
import { CLOSED } from './closed-message';
import { GONE } from './gone-message';
import { NAME_INVALID } from './name-message';
import { errorCopyText, participantErrorCopy } from './participant-error';

describe('participantErrorCopy', () => {
  it('words a capacity error for the page it is on', () => {
    const error = { code: 'capacity_full', details: { remaining: 2, requested: 3 } };
    expect(participantErrorCopy(error, 'join')?.message).toBe(
      'Only 2 spots are left, and you asked for 3.',
    );
    expect(participantErrorCopy(error, 'change')?.message).toBe(
      'You can have at most 2 spots on this slot, and you asked for 3.',
    );
  });

  it('gives closed and removed their own copy on both pages', () => {
    expect(participantErrorCopy({ code: 'closed' }, 'join')).toBe(CLOSED.join);
    expect(participantErrorCopy({ code: 'closed' }, 'change')).toBe(CLOSED.change);
    expect(participantErrorCopy({ code: 'not_found' }, 'join')).toBe(GONE);
    expect(participantErrorCopy({ code: 'not_found' }, 'change')).toBe(GONE);
  });

  it('words a refused name on both pages', () => {
    const error = { code: 'invalid_input', field: 'name', message: 'name is required' };
    expect(participantErrorCopy(error, 'join')).toBe(NAME_INVALID);
    expect(participantErrorCopy(error, 'change')).toBe(NAME_INVALID);
    expect(participantErrorCopy({ code: 'invalid_input', field: 'notes' }, 'join')).toBeNull();
  });

  it('rewords a repeat sign-up and the rate limit only when signing up', () => {
    expect(participantErrorCopy({ code: 'conflict' }, 'join')).toBe(ALREADY_SIGNED_UP);
    expect(participantErrorCopy({ code: 'rate_limited' }, 'join')?.message).toBe(
      'Too many tries just now.',
    );
    expect(participantErrorCopy({ code: 'conflict' }, 'change')).toBeNull();
    expect(participantErrorCopy({ code: 'rate_limited' }, 'change')).toBeNull();
  });

  it('leaves any other error to the server', () => {
    expect(participantErrorCopy({ code: 'invalid_input' }, 'join')).toBeNull();
    expect(participantErrorCopy(null, 'change')).toBeNull();
  });
});

describe('errorCopyText', () => {
  it('joins the message and suggestion, or gives the message alone', () => {
    expect(errorCopyText(GONE)).toBe(`${GONE.message} ${GONE.suggestion}`);
    expect(errorCopyText({ message: 'Sorry, this slot just filled up.' })).toBe(
      'Sorry, this slot just filled up.',
    );
  });
});
