import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { signupHeaderText } from './header-text';

describe('signupHeaderText', () => {
  it('is the header’s English, word for word as it read before the catalog', () => {
    expect(signupHeaderText(getTestTranslator('organizer.signup'))).toEqual({
      moreActions: 'More actions',
      closeSheet: 'Close',
      publish: {
        label: 'Publish and share',
        checking: 'Checking…',
        ready: 'Publish and share when you’re ready.',
        unsaved: 'A change didn’t save. Fix it, then publish.',
        closeSheet: 'Close',
      },
      close: { action: 'Close signup', notYet: 'Not yet', closing: 'Closing…' },
      reopen: { action: 'Reopen signup', reopening: 'Reopening…' },
      announcements: {
        closed: 'Closed. People can’t sign up now.',
        reopened: 'Reopened. People can sign up again.',
      },
      closedNotice: {
        title: 'Signup closed',
        body: 'People can’t sign up now. Everyone already signed up keeps their spot.',
        dismiss: 'Dismiss',
      },
      tabs: {
        strip: 'Signup sections',
        build: 'Build',
        responses: 'Responses',
        settings: 'Settings',
      },
    });
  });

  it.each(CATALOG_LOCALES.filter((locale) => locale !== 'en'))(
    'asks the catalog in %s for every word',
    (locale) => {
      const text = signupHeaderText(getStandInTranslator(locale, 'organizer.signup'));
      const words = (value: unknown): string[] =>
        typeof value === 'string' ? [value] : Object.values(value as object).flatMap(words);
      for (const word of words(text)) {
        expect(word).toMatch(new RegExp(`^organizer\\.signup\\.[\\w.]+ in ${locale}$`));
      }
      expect(text.publish.label).toBe(`organizer.signup.publish.label in ${locale}`);
      expect(text.tabs.strip).toBe(`organizer.signup.tabs.label in ${locale}`);
    },
  );
});

describe('a draft’s line under its title', () => {
  // Its row in Your signups and the title its own organizer sees on its
  // public link say the same (src/app/s/[slug]/page.test.tsx).
  it('says what a draft’s row in Your signups says', () => {
    const draftOnlyYou = getTestTranslator('organizer.dashboard')('draftOnlyYou');
    expect(getTestTranslator('organizer.signup')('draftLine')).toBe(
      `${draftOnlyYou} until you publish it.`,
    );
    expect(getTestTranslator('organizer.publicPage.ownDraft')('title')).toBe(draftOnlyYou);
  });
});
