import { describe, expect, it } from 'vitest';
import { isDraftWarning, warningSentence, type DraftWarning } from './draft-warnings';

const EVERY_KIND: DraftWarning[] = [
  { code: 'values_blanked', count: 2 },
  { code: 'enum_fields_to_text', fields: ['role'] },
  { code: 'duplicate_fields', count: 1 },
  { code: 'stray_values', count: 3 },
  { code: 'text_cut', field: 'title', max: 120 },
  { code: 'text_cut', field: 'description', max: 2000 },
];

describe('isDraftWarning', () => {
  it('takes every kind of warning', () => {
    for (const warning of EVERY_KIND) expect(isDraftWarning(warning), warning.code).toBe(true);
  });

  it('leaves out an English sentence, kept by a tab from before warnings had codes', () => {
    expect(isDraftWarning('Removed 1 duplicate field the AI tried to add twice.')).toBe(false);
  });

  it('leaves out a code it does not know, or one with arguments it cannot word', () => {
    for (const value of [
      null,
      7,
      [],
      {},
      { code: 'something_new', count: 1 },
      { code: 'toString' },
      { code: 'values_blanked' },
      { code: 'values_blanked', count: 0 },
      { code: 'values_blanked', count: 1.5 },
      { code: 'values_blanked', count: '2' },
      { code: 'enum_fields_to_text', fields: [] },
      { code: 'enum_fields_to_text', fields: ['role', 3] },
      { code: 'enum_fields_to_text', fields: 'role' },
      { code: 'text_cut', field: 'slots', max: 10 },
      { code: 'text_cut', field: 'title' },
    ]) {
      expect(isDraftWarning(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe('warningSentence', () => {
  it('words each code as the API always has, in English', () => {
    expect(EVERY_KIND.map(warningSentence)).toEqual([
      "2 values were left blank because they didn't fit their fields. Fill them in below.",
      'Field role arrived without a fixed list of options, so it was switched to free text.',
      'Removed 1 duplicate field the AI tried to add twice.',
      "Ignored 3 stray values that didn't match any field.",
      "The AI's title was longer than 120 characters, so the end was cut off. Check it below.",
      "The AI's description was longer than 2,000 characters, so the end was cut off. Check it below.",
    ]);
  });
});
