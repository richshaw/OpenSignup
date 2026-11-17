import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { SIGNUP_STATUSES } from '@/schemas/signups';
import { signupStatusLabel } from './status-label';

describe('signupStatusLabel', () => {
  it('says each status in English as the pill always has: the stored word', () => {
    const t = getTestTranslator('organizer.status');
    expect(SIGNUP_STATUSES.map((status) => signupStatusLabel(status, t))).toEqual([
      ...SIGNUP_STATUSES,
    ]);
    expect(signupStatusLabel('open', t)).toBe('open');
  });

  it.each(CATALOG_LOCALES.filter((locale) => locale !== 'en'))(
    'asks the catalog in %s for each status by its own key',
    (locale) => {
      const t = getStandInTranslator(locale, 'organizer.status');
      for (const status of SIGNUP_STATUSES) {
        expect(signupStatusLabel(status, t)).toBe(`organizer.status.${status} in ${locale}`);
      }
    },
  );
});
