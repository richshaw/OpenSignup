import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { removeRefusal } from './remove-refusal';

const english = {
  responses: getTestTranslator('organizer.responses'),
  errors: getTestTranslator('organizer.errors'),
};

describe('removeRefusal', () => {
  it('says the person is gone for not_found', () => {
    expect(removeRefusal('not_found', english)).toBe(
      'This person is no longer on this signup. Reload to see the latest.',
    );
  });

  it('says a viewer cannot edit', () => {
    expect(removeRefusal('forbidden', english)).toBe('You don’t have edit access.');
  });

  it.each(['conflict', 'internal', 'unauthorized'] as const)('falls back for %s', (code) => {
    expect(removeRefusal(code, english)).toBe('Couldn’t remove them. Try again.');
  });

  it.each(CATALOG_LOCALES.filter((locale) => locale !== 'en'))(
    'takes each line from the catalog in %s',
    (locale) => {
      const t = {
        responses: getStandInTranslator(locale, 'organizer.responses'),
        errors: getStandInTranslator(locale, 'organizer.errors'),
      };
      expect(removeRefusal('not_found', t)).toBe(
        `organizer.responses.remove.refusal.notFound in ${locale}`,
      );
      expect(removeRefusal('forbidden', t)).toBe(`organizer.errors.code.forbidden in ${locale}`);
      expect(removeRefusal('internal', t)).toBe(
        `organizer.responses.remove.refusal.failed in ${locale}`,
      );
    },
  );
});
