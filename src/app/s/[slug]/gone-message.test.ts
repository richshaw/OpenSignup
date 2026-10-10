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
  const pages = Object.entries(GONE_PAGE);

  // A participant can meet both: the sheet's or edit form's inline error, then
  // one of these pages on reload. They say it with the same words.
  it.each(pages)('%s reads like GONE', (_, copy) => {
    const text = `${copy.title} ${copy.body}`;
    expect(GONE.message).toMatch(/no longer available/);
    expect(text).toMatch(/no longer (be )?available/);
    expect(GONE.suggestion).toMatch(/what has changed/);
    expect(text).toMatch(/what has changed/);
  });

  it.each(pages)('%s points to the organizer without saying what happened', (_, copy) => {
    const text = `${copy.title} ${copy.body}`;
    expect(text).toMatch(/organizer/);
    expect(text).not.toMatch(/delet|remov|never|exist|typo|wrong|token/i);
  });

  // Someone who signed up without an email has no confirmation email to try,
  // but can still contact the organizer.
  it('sends everyone to the organizer, and to a confirmation email only if they got one', () => {
    expect(GONE_PAGE.editLink.body).toMatch(/\. Contact the organizer/);
    expect(GONE_PAGE.editLink.body).toMatch(/If you got a confirmation email, you can also try/);
  });
});
