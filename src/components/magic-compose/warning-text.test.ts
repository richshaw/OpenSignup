import { describe, expect, it } from 'vitest';
import { OTHER_LOCALE } from '@/i18n/testing/locales';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { warningSentence, type DraftWarning } from '@/lib/magic-compose/draft-warnings';
import { warningText } from './warning-text';

/** Each code, with counts on both sides of one, and the larger limits. */
const SAMPLES: DraftWarning[] = [
  { code: 'values_blanked', count: 1 },
  { code: 'values_blanked', count: 1234 },
  { code: 'enum_fields_to_text', fields: ['role'] },
  { code: 'enum_fields_to_text', fields: ['Shift', 'Role'] },
  { code: 'enum_fields_to_text', fields: ['a', 'b', 'c'] },
  { code: 'duplicate_fields', count: 1 },
  { code: 'duplicate_fields', count: 2 },
  { code: 'stray_values', count: 1 },
  { code: 'stray_values', count: 2 },
  { code: 'text_cut', field: 'title', max: 120 },
  { code: 'text_cut', field: 'description', max: 2000 },
];

describe('warningText', () => {
  it('reads in English exactly as the API words it', () => {
    const t = getTestTranslator('organizer.aiDraft.warnings');
    for (const warning of SAMPLES) {
      expect(warningText(warning, t, 'en')).toBe(warningSentence(warning));
    }
  });

  it("words each code from the catalog, in the organizer's language", () => {
    const locale = OTHER_LOCALE;
    const t = getStandInTranslator(locale, 'organizer.aiDraft.warnings');
    const words = (warning: DraftWarning) =>
      warningText(warning, t, locale).replace(/^organizer\.aiDraft\.warnings\.| in \w+$/g, '');
    expect(SAMPLES.map(words)).toEqual([
      'valuesBlanked',
      'valuesBlanked',
      'enumFieldsToText',
      'enumFieldsToText',
      'enumFieldsToText',
      'duplicateFields',
      'duplicateFields',
      'strayValues',
      'strayValues',
      'titleCut',
      'descriptionCut',
    ]);
  });
});
