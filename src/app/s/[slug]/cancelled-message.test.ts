import { describe, expect, it } from 'vitest';
import { CANCELLED, CANCELLED_PAGE, cancelledMessage } from './cancelled-message';

describe('cancelledMessage', () => {
  it('rephrases a conflict for participants', () => {
    expect(cancelledMessage({ code: 'conflict' })).toBe(CANCELLED);
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(cancelledMessage({ code: 'not_found' })).toBeNull();
    expect(cancelledMessage({ code: 'closed' })).toBeNull();
    expect(cancelledMessage({ code: 'capacity_full' })).toBeNull();
    expect(cancelledMessage({})).toBeNull();
    expect(cancelledMessage(null)).toBeNull();
    expect(cancelledMessage(undefined)).toBeNull();
  });
});

describe('CANCELLED_PAGE', () => {
  // A participant can meet both: the edit form's inline error, then this page
  // on reload. They say it with the same words.
  it('reads like CANCELLED', () => {
    expect(`${CANCELLED_PAGE.title}.`).toBe(CANCELLED.message);
    expect(CANCELLED_PAGE.body).toBe(CANCELLED.suggestion);
  });

  // An organizer may one day remove someone; the same words have to fit.
  it('does not say who cancelled', () => {
    const text = `${CANCELLED_PAGE.title} ${CANCELLED_PAGE.body}`;
    expect(text).not.toMatch(/you cancelled|organizer|removed/i);
  });
});
