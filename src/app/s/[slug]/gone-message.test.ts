import { describe, expect, it } from 'vitest';
import { GONE, GONE_PAGE, goneMessage } from './gone-message';

describe('goneMessage', () => {
  it('rephrases a not_found for participants', () => {
    expect(goneMessage({ code: 'not_found' })).toBe(GONE);
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(goneMessage({ code: 'closed' })).toBeNull();
    expect(goneMessage({ code: 'capacity_full' })).toBeNull();
    expect(goneMessage({})).toBeNull();
    expect(goneMessage(null)).toBeNull();
    expect(goneMessage(undefined)).toBeNull();
  });
});

describe('GONE_PAGE', () => {
  // A participant can meet both: the sheet's inline error, then this page
  // on reload. Change one and this fails until the other matches.
  it('says what GONE says, naming the signup', () => {
    expect(GONE_PAGE.title).toBe(GONE.message.replace('this', 'this signup').replace(/\.$/, ''));
  });

  it('points to the organizer without saying whether the signup ever existed', () => {
    const text = `${GONE_PAGE.title} ${GONE_PAGE.body}`;
    expect(text).toMatch(/organizer/);
    expect(text).not.toMatch(/delet|remov|never|exist|typo|wrong/i);
  });
});
