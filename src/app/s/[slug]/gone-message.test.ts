import { describe, expect, it } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { goneMessage, gonePage } from './gone-message';

const t = getTestTranslator('participant.errors');
const GONE = goneMessage({ code: 'not_found' }, t)!;
const GONE_PAGE = gonePage(getTestTranslator('participant.gonePage'));

describe('goneMessage', () => {
  it('rephrases a not_found for participants', () => {
    expect(GONE).toStrictEqual({
      message: 'Sorry, this is no longer available.',
      suggestion: 'Reload the page to see what has changed.',
    });
  });

  it('takes its lines from the translator it is given', () => {
    const sv = getStandInTranslator('sv', 'participant.errors');
    expect(goneMessage({ code: 'not_found' }, sv)).toStrictEqual({
      message: 'participant.errors.gone.message in sv',
      suggestion: 'participant.errors.gone.suggestion in sv',
    });
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(goneMessage({ code: 'closed' }, t)).toBeNull();
    expect(goneMessage({ code: 'capacity_full' }, t)).toBeNull();
    expect(goneMessage({}, t)).toBeNull();
    expect(goneMessage(null, t)).toBeNull();
    expect(goneMessage(undefined, t)).toBeNull();
  });
});

describe('gonePage', () => {
  const pages = Object.entries(GONE_PAGE);

  it('words each page as before', () => {
    expect(GONE_PAGE).toStrictEqual({
      signup: {
        title: 'Sorry, this signup is no longer available',
        body: 'Contact the organizer to find out what has changed, or to ask them for a new link.',
      },
      editLink: {
        title: 'Sorry, this link isn’t working',
        body: 'Your spot may no longer be available, or the link may be incomplete. Contact the organizer to find out what has changed. If you got a confirmation email, you can also try its link again.',
      },
    });
  });

  it('takes its lines from the translator it is given', () => {
    const sv = gonePage(getStandInTranslator('sv', 'participant.gonePage'));
    expect(sv.signup).toStrictEqual({
      title: 'participant.gonePage.signup.title in sv',
      body: 'participant.gonePage.signup.body in sv',
    });
    expect(sv.editLink).toStrictEqual({
      title: 'participant.gonePage.editLink.title in sv',
      body: 'participant.gonePage.editLink.body in sv',
    });
  });

  // A participant can meet both: the sheet's or edit form's inline error, then
  // one of these pages on reload. They say it with the same words.
  it.each(pages)('%s reads like goneMessage', (_, copy) => {
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
