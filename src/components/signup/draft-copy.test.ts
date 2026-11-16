import { describe, expect, it } from 'vitest';
import { getTestTranslator } from '@/i18n/testing/translator';
import { DRAFT_ONLY_YOU } from './draft-copy';

describe('DRAFT_ONLY_YOU', () => {
  // Until the header's text moves to the catalog too, a draft reads the same
  // under its title as on its row in Your signups.
  it('says what a draft’s row in Your signups says', () => {
    expect(getTestTranslator('organizer.dashboard')('draftOnlyYou')).toBe(DRAFT_ONLY_YOU);
  });
});
