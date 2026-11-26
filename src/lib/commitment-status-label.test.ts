import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { commitmentStatusLabel } from './commitment-status-label';

const STATUSES = [
  'confirmed',
  'tentative',
  'waitlist',
  'cancelled',
  'no_show',
  'removed',
  'moved',
] as const;

describe('commitmentStatusLabel', () => {
  it.each(STATUSES)('says %s as it is stored, in English', (status) => {
    expect(commitmentStatusLabel(status, getTestTranslator('organizer.responses'))).toBe(status);
  });

  it.each(TEST_LOCALES)('takes each status from the catalog in %s', (locale) => {
    const t = getStandInTranslator(locale, 'organizer.responses');
    expect(STATUSES.map((status) => commitmentStatusLabel(status, t))).toEqual([
      `organizer.responses.status.confirmed in ${locale}`,
      `organizer.responses.status.tentative in ${locale}`,
      `organizer.responses.status.waitlist in ${locale}`,
      `organizer.responses.status.cancelled in ${locale}`,
      `organizer.responses.status.noShow in ${locale}`,
      `organizer.responses.status.removed in ${locale}`,
      `organizer.responses.status.moved in ${locale}`,
    ]);
  });

  it('leaves a status it has no message for as stored, whatever the language', () => {
    for (const locale of CATALOG_LOCALES) {
      const t = getStandInTranslator(locale, 'organizer.responses');
      expect(commitmentStatusLabel('paused', t)).toBe('paused');
      // Not a status, though every object has it.
      expect(commitmentStatusLabel('toString', t)).toBe('toString');
    }
  });
});
