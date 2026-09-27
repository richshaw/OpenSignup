import { describe, expect, it } from 'vitest';
import { FIELD_TYPES } from '@/schemas/slot-fields';
import { FIELD_GUIDE } from './guides';

describe('FIELD_GUIDE', () => {
  // As a list entry, not just the word: "dates" and "numbers" also turn up in the explanations.
  it.each(FIELD_TYPES)('lists the %s field type', (fieldType) => {
    expect(FIELD_GUIDE).toMatch(new RegExp(`(?:Field types: |, )${fieldType}\\b`));
  });
});
